import { createHash } from "node:crypto";
import webpush, { type PushSubscription } from "web-push";
import { config } from "./config";
import { healthOf, linkIssues, type Issue } from "./health";
import { liveGames, type LiveGame } from "./home/live";
import { getSettings } from "./settingsStore";
import { getJson, hasStore, putJson } from "./store";
import type { Status } from "./types";

// Push alerts to your phone or computer: a server or endpoint goes down (and comes back), and your
// teams' games starting and finishing. Devices subscribe from Settings → Alerts; the subscriptions
// and the signing keys live in the store, so nothing else needs setting up. VAPID_PUBLIC_KEY /
// VAPID_PRIVATE_KEY pin the keys if you'd rather.

export type AlertPrefs = { servers: boolean; games: boolean };
type Sub = { sub: PushSubscription; prefs: AlertPrefs; ua?: string; at: number };
type Keys = { publicKey: string; privateKey: string };

const SUBS = "alerts:subs";
const KEYS = "alerts:vapid";
const STATE = "alerts:state";
const CONFIRM = 2; // collects in a row before a problem (or a recovery) is believed
const GAMES_EVERY = 60_000;

const g = globalThis as typeof globalThis & { __homebaseAlerts?: Mem };
type Mem = {
  keys?: Keys;
  subs?: Record<string, Sub>;
  // what was announced: issue key -> true while down; game id -> "start" | "final"
  state?: { down: Record<string, string>; games: Record<string, string> };
  runs: Record<string, number>; // consecutive collects an issue has been seen (+) or clear (-)
  gamesAt: number;
};
const mem = (g.__homebaseAlerts ??= { runs: {}, gamesAt: 0 });

export const alertsAvailable = () => hasStore() && !config.backup.mode;

export async function vapidKeys(): Promise<Keys> {
  if (mem.keys) return mem.keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return (mem.keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY });
  }
  const [saved] = await getJson<Keys>(KEYS);
  if (saved?.publicKey && saved.privateKey) return (mem.keys = saved);
  const made = webpush.generateVAPIDKeys();
  await putJson(KEYS, made);
  return (mem.keys = made);
}

async function subs(): Promise<Record<string, Sub>> {
  if (mem.subs) return mem.subs;
  const [saved] = await getJson<Record<string, Sub>>(SUBS);
  return (mem.subs = saved ?? {});
}
const idOf = (endpoint: string) => createHash("sha1").update(endpoint).digest("hex").slice(0, 16);

export async function subscribe(sub: PushSubscription, prefs: AlertPrefs, ua?: string) {
  const all = await subs();
  all[idOf(sub.endpoint)] = { sub, prefs, ua: ua?.slice(0, 120), at: Date.now() };
  await putJson(SUBS, all);
  return prefs;
}
export async function unsubscribe(endpoint: string) {
  const all = await subs();
  delete all[idOf(endpoint)];
  await putJson(SUBS, all);
}
export async function prefsOf(endpoint: string): Promise<AlertPrefs | null> {
  return (await subs())[idOf(endpoint)]?.prefs ?? null;
}
export async function subscriberCount() {
  return Object.keys(await subs()).length;
}

type Msg = { title: string; body: string; url?: string; tag?: string };

/** Send to every device that wants this kind of alert (or one device, by endpoint). */
export async function send(kind: keyof AlertPrefs | "test", msg: Msg, only?: string) {
  const all = await subs();
  const keys = await vapidKeys();
  const subject = process.env.VAPID_SUBJECT || `https://${process.env.PUBLIC_HOST || "homebase.local"}`;
  const targets = Object.entries(all).filter(([, s]) => (only ? s.sub.endpoint === only : kind !== "test" && s.prefs[kind]));
  let gone = false;
  await Promise.all(
    targets.map(async ([id, s]) => {
      try {
        await webpush.sendNotification(s.sub, JSON.stringify(msg), { vapidDetails: { subject, ...keys }, TTL: 3600 });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          delete all[id]; // that device unsubscribed or was wiped
          gone = true;
        } else console.error("push failed:", (e as Error).message);
      }
    }),
  );
  if (gone) await putJson(SUBS, all);
  return targets.length;
}

// ---------- server problems

async function state() {
  if (mem.state) return mem.state;
  const [saved] = await getJson<Mem["state"]>(STATE);
  return (mem.state = saved ?? { down: {}, games: {} });
}
const saveState = () => putJson(STATE, mem.state);

const keyOf = (scope: string, i: Issue) => `${scope}|${i.text}`;

/** Called after every collect: announce problems that stick for a couple of rounds, and recoveries. */
export async function watchServers(status: Status) {
  if (!alertsAvailable() || !status.updated) return;
  const all = await subs();
  if (!Object.values(all).some((s) => s.prefs.servers)) return;
  const st = await state();
  const now = new Map<string, { scope: string; issue: Issue }>();
  for (const s of status.servers) for (const i of healthOf(s).issues) if (i.level === "bad") now.set(keyOf(s.name, i), { scope: s.name, issue: i });
  for (const i of linkIssues(status.links)) if (i.level === "bad") now.set(keyOf("Endpoint", i), { scope: "Endpoint", issue: i });

  let changed = false;
  for (const [k, { scope, issue }] of now) {
    mem.runs[k] = Math.max(1, (mem.runs[k] ?? 0) + 1);
    if (!st.down[k] && mem.runs[k] >= CONFIRM) {
      st.down[k] = new Date().toISOString();
      changed = true;
      await send("servers", { title: `${scope}: ${issue.text}`, body: issue.detail ?? "Tap to see the Servers tab.", url: "/#servers", tag: `srv-${k}` });
    }
  }
  for (const k of Object.keys(st.down)) {
    if (now.has(k)) continue;
    mem.runs[k] = Math.min(-1, (mem.runs[k] ?? 0) - 1);
    if (-mem.runs[k] >= CONFIRM) {
      const [scope, text] = k.split("|");
      const since = Date.parse(st.down[k]);
      const mins = Math.round((Date.now() - since) / 60_000);
      delete st.down[k];
      delete mem.runs[k];
      changed = true;
      await send("servers", { title: `${scope} is back`, body: `${text} — cleared after ${mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} h`}.`, url: "/#servers", tag: `srv-${k}` });
    }
  }
  for (const k of Object.keys(mem.runs)) if (!now.has(k) && !st.down[k]) delete mem.runs[k];
  if (changed) await saveState();
}

// ---------- games

const side = (g: LiveGame) => (g.home.mine ? g.home : g.away);
const other = (g: LiveGame) => (g.home.mine ? g.away : g.home);

/** Once a minute: your teams' games starting, and their final scores. */
export async function watchGames() {
  if (!alertsAvailable() || Date.now() - mem.gamesAt < GAMES_EVERY) return;
  mem.gamesAt = Date.now();
  const all = await subs();
  if (!Object.values(all).some((s) => s.prefs.games)) return;
  const s = await getSettings();
  if (!s.teams.length) return;
  const games = await liveGames(s.teams).catch(() => [] as LiveGame[]);
  const st = await state();
  let changed = false;
  for (const game of games) {
    const me = side(game), them = other(game);
    const vs = game.home.mine ? `vs ${them.name}` : `at ${them.name}`;
    if (game.state === "in" && !st.games[game.id]) {
      st.games[game.id] = "start";
      changed = true;
      await send("games", { title: `${me.name} ${vs} is starting`, body: game.broadcast ? `On ${game.broadcast}.` : game.detail, url: "/", tag: `game-${game.id}` });
    } else if (game.state === "post" && st.games[game.id] !== "final") {
      st.games[game.id] = "final";
      changed = true;
      const mine = me.score ?? 0, theirs = them.score ?? 0;
      const word = mine > theirs ? "beat" : mine < theirs ? "lost to" : "tied";
      await send("games", { title: `Final: ${me.name} ${word} ${them.name} ${mine}–${theirs}`, body: game.detail, url: "/", tag: `game-${game.id}` });
    }
  }
  // forget games older than a day so the list doesn't grow forever
  const live = new Set(games.map((x) => x.id));
  for (const id of Object.keys(st.games)) if (!live.has(id) && Object.keys(st.games).length > 40) { delete st.games[id]; changed = true; }
  if (changed) await saveState();
}
