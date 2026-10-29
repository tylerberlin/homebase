import pkg from "@/package.json";

// "Update available" in Settings: compares this copy's version with the newest release on GitHub.
// The only thing sent is a plain request for the repo's latest release; nothing about this install.
// UPDATE_REPO points it at a fork (owner/name); UPDATE_CHECK=off turns it off.

export type UpdateInfo = { current: string; latest?: string; url?: string; notes?: string; published?: string };

const REPO = process.env.UPDATE_REPO || "tylerberlin/homebase";
const OFF = /^(0|off|false|no)$/i.test(process.env.UPDATE_CHECK ?? "");
const EVERY = 6 * 3600_000;

let cache: { at: number; info: UpdateInfo } | undefined;

const parts = (v: string) => v.replace(/^v/i, "").split(/[.-]/).map((n) => parseInt(n, 10) || 0);

/** True when version a is newer than b (major.minor.patch). */
export function newer(a: string, b: string) {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

/** Release notes are Markdown; the notice shows them as plain text. */
function plain(md: string) {
  return md
    .replace(/\r/g, "")
    .replace(/^>\s*\[!\w+\]\s*$/gm, "")
    .replace(/^\s*(#{1,6}|>)\s?/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = pkg.version;
  if (OFF || !/^[\w.-]+\/[\w.-]+$/.test(REPO)) return { current };
  if (cache && Date.now() - cache.at < EVERY) return cache.info;
  let info: UpdateInfo = { current };
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "homebase-update-check" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) {
      const d = (await r.json()) as { tag_name?: string; html_url?: string; body?: string; published_at?: string };
      if (d.tag_name && newer(d.tag_name, current)) {
        info = { current, latest: d.tag_name.replace(/^v/i, ""), url: d.html_url, notes: d.body ? plain(d.body).slice(0, 2000) : undefined, published: d.published_at };
      }
    }
  } catch {
    // Offline or rate-limited: say nothing, try again next time.
    return cache?.info ?? info;
  }
  cache = { at: Date.now(), info };
  return info;
}
