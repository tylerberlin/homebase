"use client";

import { useCallback, useEffect, useState } from "react";
import type { AlertPrefs } from "@/lib/alerts";
import Switch from "./Switch";

// Settings → Alerts: turn push alerts on for this device, choose what to hear about, send a test.

type State = "loading" | "unsupported" | "unavailable" | "off" | "denied" | "on" | "busy";

const toKey = (b64: string) => {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64.length / 4) * 4, "="));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const standalone = () => typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
const isIOS = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);

export default function AlertsSection({ demo }: { demo: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [prefs, setPrefs] = useState<AlertPrefs>({ servers: true, games: true });
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (demo) return setState("off");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
    try {
      const r = await fetch("/api/alerts", { cache: "no-store" });
      const d = (await r.json()) as { available: boolean };
      if (!d.available) return setState("unavailable");
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        setEndpoint(sub.endpoint);
        const p = (await (await fetch(`/api/alerts?endpoint=${encodeURIComponent(sub.endpoint)}`, { cache: "no-store" })).json()) as { prefs: AlertPrefs | null };
        if (p.prefs) {
          setPrefs(p.prefs);
          return setState("on");
        }
      }
      setState(Notification.permission === "denied" ? "denied" : "off");
    } catch {
      setState("unavailable");
    }
  }, [demo]);
  useEffect(() => void load(), [load]);

  const turnOn = async () => {
    setNote(null);
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState("denied");
      const { publicKey } = (await (await fetch("/api/alerts", { cache: "no-store" })).json()) as { publicKey: string };
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
      const r = await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), prefs }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      setEndpoint(sub.endpoint);
      setState("on");
    } catch (e) {
      setNote(`Couldn't turn alerts on: ${(e as Error).message}`);
      setState("off");
    }
  };

  const turnOff = async () => {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/alerts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
    } finally {
      setEndpoint(null);
      setState("off");
    }
  };

  const save = async (next: AlertPrefs) => {
    setPrefs(next);
    if (state !== "on") return;
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), prefs: next }) });
  };

  const test = async () => {
    if (!endpoint) return;
    setNote(null);
    const r = await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ test: true, endpoint }) });
    const d = (await r.json().catch(() => ({}))) as { sent?: number; error?: string };
    setNote(d.sent ? "Sent. It should show up in a moment." : d.error ?? "That didn't go through.");
  };

  const iosNeedsInstall = isIOS() && !standalone();

  return (
    <>
      <p className="set-intro">A notification on this device when a server or endpoint goes down (and comes back), and when your teams&apos; games start and finish.</p>
      {demo && <p className="set-hint">Demo: alerts work on your own copy.</p>}
      {state === "unsupported" && (
        <p className="set-hint">{iosNeedsInstall ? "On iPhone and iPad, first add the dashboard to your Home Screen (Share → Add to Home Screen), then open it from there and turn alerts on." : "This browser can't receive push alerts."}</p>
      )}
      {state === "unavailable" && <p className="set-hint">Alerts need somewhere to keep subscriptions: connect Upstash or let Homebase use its data folder.</p>}
      {state === "denied" && <p className="set-hint">Notifications are blocked for this site in your browser settings. Allow them, then try again.</p>}
      <div className="set-group">
        <div className="set-label">This device</div>
        {state === "on" ? (
          <div className="set-add-row">
            <button type="button" className="chip on" onClick={turnOff}>
              Alerts on · turn off
            </button>
            <button type="button" className="chip" onClick={test}>
              Send a test
            </button>
          </div>
        ) : (
          <button type="button" className="btn" onClick={turnOn} disabled={demo || state === "busy" || state === "unsupported" || state === "unavailable" || state === "loading"}>
            {state === "busy" ? "Turning on…" : "Turn on alerts for this device"}
          </button>
        )}
        {note && <p className="set-hint">{note}</p>}
      </div>
      <div className="set-group">
        <div className="set-label">What to hear about</div>
        <div className="set-row">
          <div className="set-label">
            Server problems
            <span className="set-hint">A server or endpoint down, a pool degraded, an app crashed; and when it&apos;s fixed.</span>
          </div>
          <div className="set-control">
            <Switch on={prefs.servers} onChange={(v) => save({ ...prefs, servers: v })} label="Server problems" />
          </div>
        </div>
        <div className="set-row">
          <div className="set-label">
            Games
            <span className="set-hint">Your teams&apos; games starting, and the final score.</span>
          </div>
          <div className="set-control">
            <Switch on={prefs.games} onChange={(v) => save({ ...prefs, games: v })} label="Games" />
          </div>
        </div>
      </div>
      <p className="set-hint">Each device is separate: turn alerts on from your phone to get them there too.</p>
    </>
  );
}
