"use client";

import { useEffect, useState } from "react";
import type { CalEvent, CalendarData } from "@/lib/calendar";
import { fmtTime, useHour12 } from "@/lib/prefs";
import { countdown, eventTimes } from "@/lib/useCalendar";

// "Upcoming" card: today and the next week from the connected calendars.

const MAX = 12;

function dayLabel(d: Date, today: Date) {
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - today.getTime()) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function Upcoming({ data }: { data: CalendarData | null }) {
  const hour12 = useHour12();
  const time = (d: Date) => fmtTime(d, hour12);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!data || !data.configured || now == null) return null;

  const today = new Date(new Date(now).setHours(0, 0, 0, 0));
  const upcoming = data.events.filter((e) => eventTimes(e).end.getTime() > now).slice(0, MAX);
  const groups = new Map<string, CalEvent[]>();
  for (const e of upcoming) {
    const label = dayLabel(eventTimes(e).start < today ? today : eventTimes(e).start, today);
    groups.set(label, [...(groups.get(label) ?? []), e]);
  }

  return (
    <section className="card upcoming" id="calendar">
      <h3>Upcoming</h3>
      {upcoming.length === 0 && <div className="cal-empty">Nothing in the next week.</div>}
      {[...groups].map(([label, events]) => (
        <div className="cal-day" key={label}>
          <div className="cal-day-label">{label}</div>
          <ul>
            {events.map((e, i) => {
              const { start, end } = eventTimes(e);
              const soon = countdown(e, now);
              return (
                <li key={i} className={`cal-event ${soon === "now" ? "now" : ""}`}>
                  <span className="cal-dot" style={{ background: e.color }} />
                  <span className="cal-time mono">{e.allDay ? "All day" : time(start)}</span>
                  <span className="cal-title">
                    {e.title}
                    {e.location && <span className="cal-where"> · {e.location}</span>}
                  </span>
                  {soon && <span className={`cal-soon ${soon === "now" ? "now" : ""}`}>{soon}</span>}
                  <span className="sr-only">
                    {" "}
                    ({e.calendar}
                    {!e.allDay && `, until ${time(end)}`})
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {data.errors.length > 0 && (
        <div className="cal-error">Couldn&apos;t load {data.errors.map((x) => x.calendar).join(", ")}; showing what it had last.</div>
      )}
    </section>
  );
}
