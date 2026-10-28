import { getJson, hasStore, putJson } from "../store";

// Countdowns you add on the page, kept in the shared store so every device sees the same list.

export type Countdown = { id: string; title: string; date: string /* YYYY-MM-DD */ };
const KEY = "countdowns";
const MAX = 20;

export async function listCountdowns(): Promise<Countdown[]> {
  if (!hasStore()) return [];
  const [list] = await getJson<Countdown[]>(KEY);
  return (list ?? []).sort((a, b) => a.date.localeCompare(b.date));
}

export async function addCountdown(title: string, date: string): Promise<Countdown[]> {
  const list = await listCountdowns();
  if (list.length >= MAX) throw new Error(`up to ${MAX} countdowns`);
  list.push({ id: crypto.randomUUID().slice(0, 8), title, date });
  await putJson(KEY, list);
  return listCountdowns();
}

export async function removeCountdown(id: string): Promise<Countdown[]> {
  const list = (await listCountdowns()).filter((c) => c.id !== id);
  await putJson(KEY, list);
  return list;
}
