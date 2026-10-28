"use client";

import { useEffect } from "react";

// Signs out after 15 minutes without a click, key, scroll or touch (the server refuses the session
// by then anyway, see lib/auth/session.ts). Activity renews the session at most once a minute.
// Open tabs share the idle clock through localStorage, so a forgotten tab can't sign out one in use.
// The room display counts as always active, so a wall screen stays up.

const IDLE_MS = 15 * 60_000;
const TOUCH_EVERY = 60_000;
const KEY = "bd-last-active";
const EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;

const touch = () =>
  fetch("/api/auth/touch", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
    .then((r) => r.status !== 401)
    .catch(() => true); // offline: keep going, the next touch retries

export function useIdleLogout(enabled: boolean, alwaysActive = false) {
  useEffect(() => {
    if (!enabled) return;
    let last = Date.now();
    let lastTouch = Date.now(); // signing in just started a fresh session
    let done = false;

    const shared = () => {
      try {
        return Number(localStorage.getItem(KEY)) || 0;
      } catch {
        return 0;
      }
    };
    const signOut = async () => {
      if (done) return;
      done = true;
      await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
      window.location.reload(); // the login page appears here, and comes back to this page after
    };
    const renew = async () => {
      lastTouch = Date.now();
      if (!(await touch())) window.location.reload(); // already signed out (other tab, or too long asleep)
    };
    const onActivity = () => {
      last = Date.now();
      try {
        localStorage.setItem(KEY, String(last));
      } catch {}
      if (last - lastTouch > TOUCH_EVERY) void renew();
    };
    const check = () => {
      if (alwaysActive) {
        if (Date.now() - lastTouch > TOUCH_EVERY) void renew();
        return;
      }
      if (Date.now() - Math.max(last, shared()) > IDLE_MS) void signOut();
    };

    onActivity();
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const onVisible = () => document.visibilityState === "visible" && check(); // phone woke up
    document.addEventListener("visibilitychange", onVisible);
    const t = setInterval(check, 15_000);
    return () => {
      clearInterval(t);
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, alwaysActive]);
}
