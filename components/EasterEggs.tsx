"use client";

import { useEffect, useState } from "react";
import { usePrefs } from "@/lib/prefs";

// Hidden extras: click the logo three times quickly in some themes, or enter the Konami code
// (↑↑↓↓←→←→BA) in Arcade. Each sets data-egg on <html> for a moment; globals.css does the show.

const EGGS: Record<string, string> = {
  circuits: "88 MPH",
  hyperspace: "Lightspeed",
  snowfall: "Let it snow",
  spooky: "Boo!",
  newyear: "Happy New Year!",
  blocks: "+1 Grass Block",
  deepwater: "You're gonna need a bigger dashboard",
};
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

export default function EasterEggs() {
  const { settings } = usePrefs();
  const skin = settings.look.skin;
  const [egg, setEgg] = useState<string | null>(null);

  useEffect(() => {
    if (!egg) return;
    const root = document.documentElement;
    root.dataset.egg = skin;
    const t = setTimeout(() => {
      delete root.dataset.egg;
      setEgg(null);
    }, 2600);
    return () => clearTimeout(t);
  }, [egg, skin]);

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
        setEgg("Extra life!");
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
    <div className="egg-banner" role="status">
      {egg}
    </div>
  );
}
