"use client";

import { useEffect, useState } from "react";
import type { App } from "@/lib/types";

// Start / stop / restart buttons for an app, container, VM or the Minecraft server: on a server
// card's app details, and in the Minecraft section. Stop and restart ask first.

type Action = "start" | "stop" | "restart";
let known: boolean | null = null; // asked once per page: does this copy allow controls?

export function useControlsEnabled() {
  const [on, setOn] = useState(known);
  useEffect(() => {
    if (known != null) return;
    fetch("/api/apps", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => setOn((known = !!d.enabled)))
      .catch(() => setOn((known = false)));
  }, []);
  return on;
}

export default function AppControls({ server, app, running, name = app.name }: { server: string; app: App; running: boolean; name?: string }) {
  const enabled = useControlsEnabled();
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  if (!enabled) return null;

  const run = async (action: Action) => {
    setConfirm(null);
    setSaid(null);
    if (new URLSearchParams(window.location.search).has("demo")) return setSaid({ ok: true, text: `Demo: ${name} would ${action} now.` });
    setBusy(action);
    try {
      const r = await fetch("/api/apps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ server, app: { name: app.name, id: app.id, kind: app.kind }, action }) });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) setSaid({ ok: false, text: d.error ?? `HTTP ${r.status}` });
      else setSaid({ ok: true, text: `${action === "stop" ? "Stopping" : action === "start" ? "Starting" : "Restarting"} ${name}. Updates on the next check.` });
    } catch {
      setSaid({ ok: false, text: "Couldn't reach the dashboard." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="app-controls">
      <div className="app-actions">
        {confirm ? (
          <>
            <span className="app-confirm">
              {confirm === "stop" ? "Stop" : "Restart"} {name}?
            </span>
            <button type="button" className="chip on" onClick={() => run(confirm)}>
              Yes, {confirm}
            </button>
            <button type="button" className="chip" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </>
        ) : running ? (
          <>
            <button type="button" className="chip" disabled={!!busy} onClick={() => setConfirm("restart")}>
              {busy === "restart" ? "Restarting…" : "Restart"}
            </button>
            <button type="button" className="chip" disabled={!!busy} onClick={() => setConfirm("stop")}>
              {busy === "stop" ? "Stopping…" : "Stop"}
            </button>
          </>
        ) : (
          <button type="button" className="chip on" disabled={!!busy} onClick={() => run("start")}>
            {busy === "start" ? "Starting…" : "Start"}
          </button>
        )}
      </div>
      {said && (
        <p className={`app-note ${said.ok ? "" : "warn"}`} role="status">
          {said.text}
        </p>
      )}
    </div>
  );
}
