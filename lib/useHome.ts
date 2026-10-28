"use client";

import { useEffect, useState } from "react";
import type { Forecast } from "./home/forecast";
import type { Quote } from "./home/markets";
import type { Headline } from "./home/news";
import type { TeamInfo } from "./home/sports";

export type HomeData = { weather?: Forecast; teams: TeamInfo[]; quotes: Quote[]; headlines: Headline[]; updated: number };

/** Polls /api/home once a minute while the Home tab is open and the page is visible; `key` changes refetch at once. */
export function useHome(active: boolean, at: { lat: number; lon: number } | null = null, key = "") {
  const [data, setData] = useState<HomeData | null>(null);
  const query = at ? `?lat=${at.lat}&lon=${at.lon}` : "";
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(`/api/home${query}`, { cache: "no-store" });
        if (r.ok && !cancelled) setData(await r.json());
      } catch {}
    };
    void load();
    const t = setInterval(load, 60_000);
    const onVisible = () => !document.hidden && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, query, key]);
  return data;
}

/** Re-renders every `ms` so relative times ("in 3 h", "5 min ago") stay current. Null until mounted. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export const ago = (iso: string | undefined, now: number) => {
  if (!iso) return "";
  const s = (now - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};
