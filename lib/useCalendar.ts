"use client";

import { useEffect, useState } from "react";
import type { CalEvent, CalendarData } from "./calendar";

// Shared by the Upcoming card and the room display. Refreshes every 5 minutes.

const REFRESH = 5 * 60 * 1000;

function demoCalendar(): CalendarData {
  const at = (days: number, h: number, m = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const day = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const soon = new Date(Date.now() + 45 * 60 * 1000);
  const ev = (title: string, calendar: string, color: string, start: string, end: string, allDay = false, location?: string): CalEvent => ({ title, calendar, color, start, end, allDay, location });
  return {
    configured: 2,
    updated: Date.now(),
    errors: [],
    events: [
      ev("Pick up hoverboard", "Personal", "#4ea8ff", soon.toISOString(), new Date(soon.getTime() + 3600e3).toISOString(), false, "Courthouse Square"),
      ev("Enchantment Under the Sea dance", "Personal", "#4ea8ff", at(0, 20), at(0, 22)),
      ev("Lightning hits the clock tower", "Personal", "#4ea8ff", at(0, 22, 4), at(0, 22, 5)),
      ev("Jaws 19 premiere", "Work", "#34d3c0", day(1), day(2), true),
      ev("Lunch at Caf\u00e9 80\u2019s", "Work", "#34d3c0", at(2, 12), at(2, 13)),
      ev("Refuel Mr. Fusion", "Personal", "#4ea8ff", at(3, 15), at(3, 16)),
    ],
  };
}

export function useCalendar(demo: boolean) {
  const [data, setData] = useState<CalendarData | null>(null);
  useEffect(() => {
    if (demo) {
      setData(demoCalendar());
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/calendar", { cache: "no-store" });
        if (r.ok && !cancelled) setData(await r.json());
      } catch {}
    };
    void load();
    const t = setInterval(load, REFRESH);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [demo]);
  return data;
}

/** Start/end as Dates in the viewer's time zone (all-day dates are local midnights). */
export function eventTimes(e: CalEvent) {
  const parse = (v: string) => {
    if (!e.allDay) return new Date(v);
    const [y, m, d] = v.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  return { start: parse(e.start), end: parse(e.end) };
}

/** "now", "in 45 min", "in 3 h", or null when it's further out than a day. */
export function countdown(e: CalEvent, now: number) {
  if (e.allDay) return null;
  const { start, end } = eventTimes(e);
  if (start.getTime() <= now && end.getTime() > now) return "now";
  const mins = Math.round((start.getTime() - now) / 60000);
  if (mins < 0 || mins > 24 * 60) return null;
  if (mins < 60) return `in ${Math.max(1, mins)} min`;
  return `in ${Math.round(mins / 60)} h`;
}
