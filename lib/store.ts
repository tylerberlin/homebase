import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

// Shared storage: Upstash Redis over its REST API (Vercel's Upstash integration sets
// KV_REST_API_URL / KV_REST_API_TOKEN; NAS gets the same two). Holds the backup site's
// server reports and things you edit on the page, like countdowns. Only a handful of small keys.
// Without Upstash it falls back to a small JSON file on this machine (DATA_DIR, default ./data),
// so a plain install works with nothing else set up. Not on Vercel, whose disk is read-only.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const REMOTE = !!URL_ && !!TOKEN;
const LOCAL = !REMOTE && !process.env.VERCEL;
const FILE = path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "homebase.json");

type Cmd = (string | number)[];

async function redis<T>(command: Cmd): Promise<T> {
  if (LOCAL) return local(command) as Promise<T>;
  if (!REMOTE) throw new Error("Upstash Redis is not connected (KV_REST_API_URL / KV_REST_API_TOKEN)");
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  const d = (await r.json()) as { result?: T; error?: string };
  if (!r.ok || d.error) throw new Error(d.error || `Upstash HTTP ${r.status}`);
  return d.result as T;
}

// ---------- the local file: the few Redis commands used here, kept in memory and saved on change

type Entry = { v: string; exp?: number };
const g = globalThis as typeof globalThis & { __homebaseStore?: Promise<Map<string, Entry>>; __homebaseSave?: Promise<void> };

function load() {
  return (g.__homebaseStore ??= readFile(FILE, "utf8").then(
    (s) => new Map(Object.entries(JSON.parse(s) as Record<string, Entry>)),
    () => new Map<string, Entry>(),
  ));
}

function save(m: Map<string, Entry>) {
  // Writes one after another, to a temp file then renamed, so a crash can't leave half a file.
  const run = async () => {
    await mkdir(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    await writeFile(tmp, JSON.stringify(Object.fromEntries(m)), { mode: 0o600 });
    await rename(tmp, FILE);
    await chmod(FILE, 0o600).catch(() => {});
  };
  return (g.__homebaseSave = (g.__homebaseSave ?? Promise.resolve()).then(run, run));
}

async function local(c: Cmd): Promise<unknown> {
  const m = await load();
  const now = Date.now();
  const get = (k: string) => {
    const e = m.get(k);
    if (e?.exp && e.exp <= now) {
      m.delete(k);
      return undefined;
    }
    return e;
  };
  const [op, ...a] = c.map(String);
  switch (op) {
    case "GET":
      return get(a[0])?.v ?? null;
    case "MGET":
      return a.map((k) => get(k)?.v ?? null);
    case "SET":
      m.set(a[0], { v: a[1], exp: a[2] === "EX" ? now + Number(a[3]) * 1000 : undefined });
      await save(m);
      return "OK";
    case "DEL":
      m.delete(a[0]);
      await save(m);
      return 1;
    case "INCR": {
      const e = get(a[0]);
      const n = Number(e?.v ?? 0) + 1;
      m.set(a[0], { v: String(n), exp: e?.exp });
      await save(m);
      return n;
    }
    case "EXPIRE": {
      const e = get(a[0]);
      if (e) {
        e.exp = now + Number(a[1]) * 1000;
        await save(m);
      }
      return e ? 1 : 0;
    }
  }
  throw new Error(`unsupported store command ${op}`);
}

const key = (k: string) => `homebase:${k}`;

export const putJson = (k: string, v: unknown) => redis(["SET", key(k), JSON.stringify(v)]);

export async function getJson<T>(...keys: string[]): Promise<(T | null)[]> {
  const raw = await redis<(string | null)[]>(["MGET", ...keys.map(key)]);
  return raw.map((x) => {
    try {
      return x ? (JSON.parse(x) as T) : null;
    } catch {
      return null;
    }
  });
}

export const hasStore = () => REMOTE || LOCAL;

/** SET with an expiry, for short-lived values like login challenges. */
export const putJsonFor = (k: string, v: unknown, seconds: number) => redis(["SET", key(k), JSON.stringify(v), "EX", seconds]);
export const del = (k: string) => redis(["DEL", key(k)]);

/** Counts events in a window (e.g. failed logins); returns the count so far. */
export async function bump(k: string, windowSeconds: number): Promise<number> {
  const n = await redis<number>(["INCR", key(k)]);
  if (n === 1) await redis(["EXPIRE", key(k), windowSeconds]);
  return n;
}
export const count = async (k: string) => Number((await redis<string | null>(["GET", key(k)])) ?? 0);
