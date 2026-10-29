"use client";

import { useEffect, useState } from "react";
import { usePrefs } from "@/lib/prefs";

// Hidden extras: click the logo three times quickly in some themes, or enter the Konami code
// (↑↑↓↓←→←→BA) in Arcade. Each shows a layer in front of the page for a moment; globals.css
// draws the theme's effect and the badge.

const EGGS: Record<string, [string, string?]> = {
  circuits: ["88 MPH", "1.21 gigawatts"],
  hyperspace: ["Lightspeed", "Punch it"],
  snowfall: ["Let it snow"],
  spooky: ["Boo!"],
  newyear: ["Happy New Year!"],
  blocks: ["+1 Grass Block", "Achievement get"],
  deepwater: ["You're gonna need a bigger dashboard"],
};
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

export default function EasterEggs() {
  const { settings } = usePrefs();
  const skin = settings.look.skin;
  const [egg, setEgg] = useState<[string, string?] | null>(null);

  useEffect(() => {
    if (!egg) return;
    const t = setTimeout(() => setEgg(null), 2800);
    return () => clearTimeout(t);
  }, [egg]);

  useEffect(() => {
    let clicks: number[] = [];
    const onClick = (e: MouseEvent) => {
      if (!EGGS[skin] || !(e.target instanceof Element && e.target.closest(".brand .logo, .brand .logo-block, .brand .logo-lens"))) return;
      const now = Date.now();
      clicks = [...clicks.filter((t) => now - t < 1200), now];
      if (clicks.length >= 3) {
        clicks = [];
        setEgg(EGGS[skin]);
      }
    };
    let keys: string[] = [];
    const onKey = (e: KeyboardEvent) => {
      if (skin !== "arcade" || (e.target instanceof Element && e.target.closest("input, textarea, select"))) return;
      keys = [...keys, e.key.length === 1 ? e.key.toLowerCase() : e.key].slice(-KONAMI.length);
      if (keys.join() === KONAMI.join()) {
        keys = [];
        setEgg(["Extra life!", "1UP"]);
      }
    };
    document.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [skin]);

  if (!egg) return null;
  return (
    <div className={`egg egg-${skin}`} role="status">
      <div className="egg-fx" aria-hidden="true" />
      <div className="egg-card">
        {egg[0]}
        {egg[1] && <small>{egg[1]}</small>}
      </div>
    </div>
  );
}
