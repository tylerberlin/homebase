"use client";

import { useEffect, useState } from "react";
import { useHour12, usePrefs } from "@/lib/prefs";
import type { Status } from "@/lib/types";

// Big clock with seconds and today's date, plus the time where your servers are when it differs
// from yours. Follows the 12/24-hour choice in Settings → Look.

function useSecond() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    // Tick on the second boundary so the seconds don't drift against the system clock.
    const tick = () => {
      setNow(new Date());
      t = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    };
    tick();
    return () => clearTimeout(t);
  }, []);
  return now;
}

const parts = (d: Date, hour12: boolean, timeZone?: string) => {
  const p = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit", hour12, timeZone }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === t)?.value ?? "";
  return { hm: `${get("hour")}:${get("minute")}`, s: get("second"), ampm: get("dayPeriod") };
};

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** One row of the Time Circuits theme's clock: month, day, year, AM/PM, hour, minute on a plate. */
function CircuitRow({ label, d, color, hour12 }: { label: string; d: Date; color: "red" | "green" | "amber"; hour12: boolean }) {
  const h = d.getHours();
  const hh = hour12 ? h % 12 || 12 : h;
  const field = (name: string, value: string) => (
    <span className="tc-field">
      <span className="tc-digits">{value}</span>
      <span className="tc-name">{name}</span>
    </span>
  );
  return (
    <div className={`tc-row tc-${color}`} aria-label={`${label}: ${d.toLocaleString()}`}>
      <div className="tc-fields" aria-hidden="true">
        {field("Month", MONTHS[d.getMonth()])}
        {field("Day", String(d.getDate()).padStart(2, "0"))}
        {field("Year", String(d.getFullYear()))}
        {hour12 && (
          <span className="tc-field tc-ampm">
            <span className={h < 12 ? "on" : ""}>AM</span>
            <span className={h >= 12 ? "on" : ""}>PM</span>
          </span>
        )}
        {field("Hour", String(hh).padStart(2, "0"))}
        {field("Min", String(d.getMinutes()).padStart(2, "0"))}
      </div>
      <div className="tc-plate">{label}</div>
    </div>
  );
}

// Where the time machine was set, and when it last left.
const DESTINATION = new Date(2015, 9, 21, 16, 29);
const DEPARTED = new Date(1985, 9, 26, 1, 21);

export default function ClockCard({ status }: { status: Status | null }) {
  const hour12 = useHour12();
  const { settings } = usePrefs();
  const skin = settings.look.skin;
  const now = useSecond();
  const here = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
  // One entry per time zone that isn't yours, named after the server there.
  const zones = new Map<string, string>();
  for (const s of status?.servers ?? []) if (s.tz && s.tz !== here && !zones.has(s.tz)) zones.set(s.tz, s.location);

  if (!now) return <section className="card home-card clock-card" aria-busy="true" />;
  const t = parts(now, hour12);
  const offset = (tz: string) => {
    const diff = Math.round((new Date(now.toLocaleString("en-US", { timeZone: tz })).getTime() - new Date(now.toLocaleString("en-US", { timeZone: here })).getTime()) / 3600_000);
    return diff === 0 ? "" : `${diff > 0 ? "+" : "−"}${Math.abs(diff)} h`;
  };
  const daysToNewYear = Math.ceil((new Date(now.getFullYear() + 1, 0, 1).getTime() - now.getTime()) / 86400_000);
  if (skin === "circuits") {
    return (
      <section className="card home-card clock-card tc-card" id="clock" aria-label="Clock">
        <CircuitRow label="Destination time" d={DESTINATION} color="red" hour12={hour12} />
        <CircuitRow label="Present time" d={now} color="green" hour12={hour12} />
        <CircuitRow label="Last time departed" d={DEPARTED} color="amber" hour12={hour12} />
      </section>
    );
  }
  return (
    <section className="card home-card clock-card" id="clock" aria-label="Clock">
      <div className="clock-time" role="timer" aria-live="off">
        <span className="clock-hm">{t.hm}</span>
        <span className="clock-s mono">{t.s}</span>
        {t.ampm && <span className="clock-ampm">{t.ampm}</span>}
      </div>
      <div className="clock-date">{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
      {skin === "newyear" && (
        <div className="clock-ny">
          {daysToNewYear === 1 ? "1 day" : `${daysToNewYear} days`} until {now.getFullYear() + 1}
        </div>
      )}
      {zones.size > 0 && (
        <ul className="clock-zones">
          {[...zones].map(([tz, place]) => {
            const z = parts(now, hour12, tz);
            return (
              <li key={tz}>
                <span className="clock-zone-name">{place}</span>
                <span className="mono">
                  {z.hm}
                  {z.ampm && ` ${z.ampm}`}
                </span>
                <span className="clock-zone-off mono">{offset(tz)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
