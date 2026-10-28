// Tiny time-based cache for the Home tab's outside data sources. Keeps the last good value
// through a failed refresh, so one flaky source doesn't blank its widget.

const store = new Map<string, { at: number; value: unknown }>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T | undefined> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  try {
    const value = await load();
    store.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return hit?.value as T | undefined;
  }
}

export const UA = "homebase/1.0 (personal dashboard)";

export async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const r = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}
