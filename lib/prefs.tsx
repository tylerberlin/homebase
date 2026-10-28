"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { LOOK_KEY, type Look, type Settings } from "./settings";

// The settings on the page: every component reads them from here, the Settings panel changes them.
// Changes apply at once and are saved shortly after (in demo mode they're kept on this page only).

type SaveState = "idle" | "saving" | "saved" | "error";
type Prefs = {
  settings: Settings;
  update: (change: (s: Settings) => Settings) => void;
  saveState: SaveState;
  saveError: string | null;
  canSave: boolean; // false in demo mode or without the shared store
  demo: boolean;
  /** Game-day colors: a team's hue that replaces the accent while they play (see useGameDay). */
  tint: Tint | null;
  setTint: (t: Tint | null) => void;
};
export type Tint = { h: number; s: number };

const Ctx = createContext<Prefs | null>(null);

/** Puts the look on <html> (read by globals.css) and remembers it so the next load paints it at once. */
export function applyLook(look: Look, tint: Tint | null = null) {
  const root = document.documentElement;
  // A game theme brings its own colors, so the accent, glass and game-day tint only apply to Glass.
  const skin = look.skin === "glass" ? null : look.skin;
  if (skin) root.dataset.skin = skin;
  else delete root.dataset.skin;
  if (tint && !skin) {
    root.dataset.accent = "team";
    root.style.setProperty("--h", String(tint.h));
    root.style.setProperty("--s", `${tint.s}%`);
  } else {
    root.style.removeProperty("--h");
    root.style.removeProperty("--s");
    if (skin || look.accent === "blue") delete root.dataset.accent;
    else root.dataset.accent = look.accent;
  }
  if (skin || look.glass === "frosted") delete root.dataset.glass;
  else root.dataset.glass = look.glass;
  if (look.compact) root.dataset.density = "compact";
  else delete root.dataset.density;
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify({ s: look.skin, a: look.accent, g: look.glass, c: look.compact }));
  } catch {}
}

export function PrefsProvider({ initial, saved, demo, children }: { initial: Settings; saved: boolean; demo: boolean; children: React.ReactNode }) {
  const [settings, setSettings] = useState(initial);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const canSave = saved && !demo;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(settings);
  const [tint, setTint] = useState<Tint | null>(null);

  useEffect(() => applyLook(settings.look, settings.look.gameDay ? tint : null), [settings.look, tint]);

  const save = useCallback(async () => {
    setSaveState("saving");
    try {
      const r = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(latest.current) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setSaveError(null);
      setSaveState("saved");
    } catch (e) {
      setSaveError((e as Error).message);
      setSaveState("error");
    }
  }, []);

  const update = useCallback(
    (change: (s: Settings) => Settings) => {
      setSettings((s) => (latest.current = change(s)));
      if (!canSave) return;
      clearTimeout(timer.current);
      setSaveState("saving");
      timer.current = setTimeout(save, 600);
    },
    [canSave, save],
  );

  return <Ctx.Provider value={{ settings, update, saveState, saveError, canSave, demo, tint, setTint }}>{children}</Ctx.Provider>;
}

export function usePrefs() {
  const p = useContext(Ctx);
  if (!p) throw new Error("usePrefs outside PrefsProvider");
  return p;
}

/** 12- or 24-hour clock, from the Look settings. */
export const useHour12 = () => usePrefs().settings.look.clock === "12";

export const fmtTime = (d: Date, hour12: boolean, timeZone?: string) => {
  try {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12, timeZone });
  } catch {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12 });
  }
};

/** Converts a temperature to the unit picked in settings. */
export function useTemp() {
  const unit = usePrefs().settings.look.unit;
  return (v: number, from: "F" | "C") => ({
    value: from === unit ? v : Math.round(unit === "C" ? ((v - 32) * 5) / 9 : (v * 9) / 5 + 32),
    unit,
  });
}
