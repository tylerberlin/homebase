import ICAL from "ical.js";
import { config } from "./config";

// Upcoming events from the calendars' secret .ics links (Google, iCloud, Outlook…). Fetched
// server-side and cached, so the links never reach the browser.

export type CalEvent = {
  title: string;
  calendar: string;
  color: string;
  location?: string;
  allDay: boolean;
  start: string; // ISO instant, or YYYY-MM-DD for all-day events
  end: string;
};
export type CalendarData = { configured: number; events: CalEvent[]; errors: { calendar: string; error: string }[]; updated: number };

const TTL = 5 * 60 * 1000;
const DAYS_AHEAD = 8;
const COLORS = ["#4ea8ff", "#34d3c0", "#f7c552", "#ff8a7a", "#7ddc7a", "#9cc4ff"];
const cache = new Map<string, { at: number; events: CalEvent[] }>();

const pad = (n: number) => String(n).padStart(2, "0");
const dateOnly = (t: ICAL.Time) => `${t.year}-${pad(t.month)}-${pad(t.day)}`;

function expand(text: string, calendar: string, color: string, from: Date, to: Date): CalEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);

  // Group by UID so moved/edited occurrences of a repeating event replace the original ones.
  const byUid = new Map<string, { master?: ICAL.Component; exceptions: ICAL.Component[] }>();
  for (const comp of root.getAllSubcomponents("vevent")) {
    const uid = String(comp.getFirstPropertyValue("uid") ?? Math.random());
    const entry = byUid.get(uid) ?? { exceptions: [] };
    if (comp.hasProperty("recurrence-id")) entry.exceptions.push(comp);
    else entry.master = comp;
    byUid.set(uid, entry);
  }

  const out: CalEvent[] = [];
  const add = (title: string, start: ICAL.Time, end: ICAL.Time, location?: string) => {
    const allDay = start.isDate;
    const s = allDay ? new Date(start.year, start.month - 1, start.day) : start.toJSDate();
    const e = allDay ? new Date(end.year, end.month - 1, end.day) : end.toJSDate();
    if (e <= from || s >= to) return;
    out.push({
      title: title || "(no title)",
      calendar,
      color,
      location: location || undefined,
      allDay,
      start: allDay ? dateOnly(start) : s.toISOString(),
      end: allDay ? dateOnly(end) : e.toISOString(),
    });
  };

  for (const { master, exceptions } of byUid.values()) {
    const base = master ?? exceptions[0];
    if (!base) continue;
    const event = new ICAL.Event(base);
    if (master) for (const ex of exceptions) event.relateException(ex);
    if (String(base.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") continue;

    if (!master || !event.isRecurring()) {
      add(event.summary, event.startDate, event.endDate ?? event.startDate, event.location);
      continue;
    }
    const it = event.iterator();
    for (let i = 0, t = it.next(); t && i < 1000; i++, t = it.next()) {
      const d = event.getOccurrenceDetails(t);
      if (d.startDate.toJSDate() >= to) break;
      if (String(d.item.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") continue;
      add(d.item.summary, d.startDate, d.endDate, d.item.location);
    }
  }
  return out;
}

async function load(url: string, calendar: string, color: string): Promise<CalEvent[]> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.events;
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: "no-store", headers: { "User-Agent": "homebase" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const from = new Date(Date.now() - 24 * 3600 * 1000);
  const to = new Date(Date.now() + DAYS_AHEAD * 24 * 3600 * 1000);
  const events = expand(await r.text(), calendar, color, from, to);
  cache.set(url, { at: Date.now(), events });
  return events;
}

export async function calendarData(): Promise<CalendarData> {
  const errors: CalendarData["errors"] = [];
  const lists = await Promise.all(
    config.calendars.map((c, i) =>
      load(c.url, c.name, c.color || COLORS[i % COLORS.length]).catch((e) => {
        errors.push({ calendar: c.name, error: (e as Error).message });
        return cache.get(c.url)?.events ?? [];
      }),
    ),
  );
  const key = (e: CalEvent) => (e.allDay ? new Date(e.start + "T00:00:00").getTime() - 1 : new Date(e.start).getTime());
  const events = lists.flat().sort((a, b) => key(a) - key(b));
  return { configured: config.calendars.length, events, errors, updated: Date.now() };
}
