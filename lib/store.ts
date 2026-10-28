// Shared storage: Upstash Redis over its REST API (Vercel's Upstash integration sets
// KV_REST_API_URL / KV_REST_API_TOKEN; NAS gets the same two). Holds the backup site's
// server reports and things you edit on the page, like countdowns. Only a handful of small keys.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

async function redis<T>(command: (string | number)[]): Promise<T> {
  if (!URL_ || !TOKEN) throw new Error("Upstash Redis is not connected (KV_REST_API_URL / KV_REST_API_TOKEN)");
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

export const hasStore = () => !!URL_ && !!TOKEN;

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
