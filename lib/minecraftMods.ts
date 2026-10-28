import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { cached, UA } from "./home/cache";
import type { Mod, ModList } from "./types";

// The mods installed on a Minecraft server, read from its mods folder (mounted read-only).
// Each jar's own metadata gives the name and version; Modrinth, looked up by file hash, adds the
// icon, a link, whether players need it to join, and whether there's a newer version.

const MODRINTH = "https://api.modrinth.com/v2";
const META = ["META-INF/neoforge.mods.toml", "META-INF/mods.toml", "fabric.mod.json"];

type JarInfo = { file: string; sha1: string; name: string; version: string; description?: string; loader?: string; disabled: boolean };
const jars = new Map<string, { key: string; info: JarInfo }>(); // by file name, re-read when size/mtime change

/** Reads one [[mods]] field from a mods.toml (enough of TOML for the fields we show). */
function tomlField(toml: string, field: string) {
  const block = toml.split(/^\s*\[\[mods\]\]\s*$/m)[1] ?? "";
  const m = new RegExp(`^\\s*${field}\\s*=\\s*(?:'''([\\s\\S]*?)'''|"""([\\s\\S]*?)"""|"([^"]*)"|'([^']*)')`, "m").exec(block.split(/^\s*\[/m)[0]);
  return (m?.[1] ?? m?.[2] ?? m?.[3] ?? m?.[4])?.trim() || undefined;
}

async function readJar(dir: string, file: string): Promise<JarInfo> {
  const buf = await readFile(path.join(dir, file));
  const disabled = file.endsWith(".disabled");
  const base = file.replace(/\.disabled$/, "").replace(/\.jar$/, "");
  const info: JarInfo = { file, sha1: createHash("sha1").update(buf).digest("hex"), name: base, version: "", disabled };
  try {
    const files = unzipSync(buf, { filter: (f) => META.includes(f.name) || f.name === "META-INF/MANIFEST.MF" });
    const manifestVersion = files["META-INF/MANIFEST.MF"] && /^Implementation-Version:\s*(.+)$/m.exec(strFromU8(files["META-INF/MANIFEST.MF"]))?.[1].trim();
    const toml = files["META-INF/neoforge.mods.toml"] ?? files["META-INF/mods.toml"];
    if (toml) {
      const t = strFromU8(toml);
      info.loader = files["META-INF/neoforge.mods.toml"] ? "NeoForge" : "Forge";
      info.name = tomlField(t, "displayName") ?? info.name;
      const v = tomlField(t, "version");
      info.version = (v && !v.includes("${") ? v : manifestVersion) || "";
      info.description = tomlField(t, "description");
    } else if (files["fabric.mod.json"]) {
      const j = JSON.parse(strFromU8(files["fabric.mod.json"]));
      info.loader = "Fabric";
      info.name = j.name || info.name;
      info.version = j.version || "";
      info.description = j.description;
    }
  } catch {} // not a readable jar: keep the file name
  return info;
}

type ModrinthVersion = { id: string; project_id: string; version_number: string };
type ModrinthProject = { id: string; slug: string; title: string; description: string; icon_url: string | null; client_side: string; server_side: string };

async function modrinth(hashes: string[], loader: string | undefined, game: string | undefined) {
  if (!hashes.length) return {};
  return (
    (await cached(`modrinth:${loader}:${game}:${hashes.join(",")}`, 6 * 3600_000, async () => {
      const post = async <T,>(url: string, body: unknown) => {
        const r = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": UA, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as T;
      };
      const [current, latest] = await Promise.all([
        post<Record<string, ModrinthVersion>>(`${MODRINTH}/version_files`, { hashes, algorithm: "sha1" }),
        post<Record<string, ModrinthVersion>>(`${MODRINTH}/version_files/update`, {
          hashes,
          algorithm: "sha1",
          ...(loader ? { loaders: [loader.toLowerCase()] } : {}),
          ...(game ? { game_versions: [game] } : {}),
        }).catch(() => ({}) as Record<string, ModrinthVersion>),
      ]);
      const ids = [...new Set(Object.values(current).map((v) => v.project_id))];
      const projects = ids.length
        ? await fetch(`${MODRINTH}/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) }).then(
            (r) => (r.ok ? (r.json() as Promise<ModrinthProject[]>) : []),
          )
        : [];
      const byId = new Map(projects.map((p) => [p.id, p]));
      return Object.fromEntries(
        Object.entries(current).map(([hash, v]) => [hash, { version: v, latest: latest[hash] as ModrinthVersion | undefined, project: byId.get(v.project_id) }]),
      );
    })) ?? {}
  );
}

/** Whether players need the mod to join. Modrinth's client_side alone says "optional" for mods like
 *  Create (it means "works in single-player without a server"); a mod the server requires and the
 *  game client can run adds content, so players need it too. */
function clientNeed(p: ModrinthProject | undefined): Mod["client"] {
  if (!p) return undefined;
  if (p.client_side === "unsupported") return "unsupported";
  if (p.client_side === "required" || p.server_side === "required") return "required";
  return p.client_side === "optional" ? "optional" : undefined;
}

/** The server's mods, or null when no mods folder is configured. `game` is the Minecraft version, for update checks. */
export async function listMods(dir: string, game?: string): Promise<ModList | null> {
  if (!dir) return null;
  let names: string[];
  try {
    names = (await readdir(dir)).filter((f) => /\.jar(\.disabled)?$/.test(f));
  } catch (e) {
    return { loader: undefined, mods: [], error: `Can't read the mods folder (${(e as NodeJS.ErrnoException).code ?? "error"})` };
  }
  const infos: JarInfo[] = [];
  for (const file of names) {
    try {
      const s = await stat(path.join(dir, file));
      const key = `${s.size}:${s.mtimeMs}`;
      let hit = jars.get(file);
      if (hit?.key !== key) jars.set(file, (hit = { key, info: await readJar(dir, file) }));
      infos.push(hit.info);
    } catch {}
  }
  for (const f of [...jars.keys()]) if (!names.includes(f)) jars.delete(f);

  const loader = infos.find((i) => i.loader)?.loader;
  const gameVersion = game && /^\d+\.\d+(\.\d+)?$/.test(game) ? game : undefined;
  const found = await modrinth(infos.map((i) => i.sha1).toSorted(), loader, gameVersion);

  const mods: Mod[] = infos.map((i) => {
    const m = found[i.sha1];
    const p = m?.project;
    const url = p ? `https://modrinth.com/mod/${p.slug}` : undefined;
    const update = m?.latest && m.latest.id !== m.version.id ? { version: m.latest.version_number, url: `${url}/version/${m.latest.id}` } : undefined;
    return {
      file: i.file,
      name: p?.title ?? i.name,
      version: i.version || m?.version.version_number || "",
      description: p?.description ?? i.description?.split("\n")[0],
      icon: p?.icon_url ?? undefined,
      url,
      client: clientNeed(p),
      update,
      disabled: i.disabled || undefined,
    };
  });
  mods.sort((a, b) => Number(!!a.disabled) - Number(!!b.disabled) || a.name.localeCompare(b.name));
  return { loader: loader && gameVersion ? `${loader} ${gameVersion}` : loader, mods };
}
