"use client";

import { useCallback, useEffect, useState } from "react";

// Weather for home, or for wherever this device is. The choice is remembered per device; the
// position is rounded to ~1 km before it's sent anywhere, and refreshed every 15 minutes.

export type WxMode = "home" | "here";
export type WxLocation = {
  mode: WxMode;
  setMode: (m: WxMode) => void;
  coords: { lat: number; lon: number } | null;
  status: "idle" | "locating" | "denied" | "unavailable";
  supported: boolean;
};

const KEY = "bd-weather-loc";
const round = (n: number) => Math.round(n * 100) / 100;

export function useWeatherLocation(): WxLocation {
  const [mode, setModeState] = useState<WxMode>("home");
  const [coords, setCoords] = useState<WxLocation["coords"]>(null);
  const [status, setStatus] = useState<WxLocation["status"]>("idle");
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    // Browsers only share location on https pages (not the plain-http Tailscale address).
    setSupported(window.isSecureContext && "geolocation" in navigator);
    try {
      if (localStorage.getItem(KEY) === "here") setModeState("here");
    } catch {}
  }, []);

  const setMode = useCallback((m: WxMode) => {
    setModeState(m);
    if (m === "home") {
      setCoords(null);
      setStatus("idle");
    }
    try {
      localStorage.setItem(KEY, m);
    } catch {}
  }, []);

  useEffect(() => {
    if (mode !== "here" || !supported) return;
    const locate = () => {
      setStatus((s) => (s === "idle" ? "locating" : s));
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setCoords({ lat: round(p.coords.latitude), lon: round(p.coords.longitude) });
          setStatus("idle");
        },
        (e) => {
          setStatus(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable");
          if (e.code === e.PERMISSION_DENIED) setModeState("home");
        },
        { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 15_000 },
      );
    };
    locate();
    const t = setInterval(locate, 15 * 60 * 1000);
    return () => clearInterval(t);
  }, [mode, supported]);

  return { mode, setMode, coords, status, supported };
}
