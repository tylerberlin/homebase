"use client";

import { useState } from "react";
import { bytes, dur, level, pct, tempLevel, type Level } from "@/lib/format";
import { healthOf, isInfoAlert, tempMax } from "@/lib/health";
import type { App, Server, Spec } from "@/lib/types";
import { ExternalIcon } from "./icons";
import MinecraftBlock from "./Minecraft";
import AppControls from "./AppControls";
import Gauge from "./Gauge";
import Sparkline from "./Sparkline";
import { LocalConditions } from "./Weather";

function Metric({ label, val, bar, lvl = "" }: { label: string; val: string; bar?: number | null; lvl?: Level }) {
  return (
    <div className="metric">
      <div className="label">{label}</div>
      <div className="val mono">{val}</div>
      {bar != null && (
        <div className="bar">
          <i className={lvl} style={{ width: `${Math.min(bar, 100)}%` }} />
        </div>
      )}
    </div>
  );
}

function Hardware({ specs }: { specs?: Spec[] }) {
  if (!specs?.length) return null;
  return (
    <div className="section">
      <h3>Hardware</h3>
      <dl className="specs">
        {specs.map((r) => (
          <div className="spec" key={r.label + r.value}>
            <dt>{r.label}</dt>
            <dd title={r.title}>
              {r.value}
              {r.detail && <span className="spec-detail"> · {r.detail}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// STOPPED is usually on purpose, so it reads as neutral rather than as a failure.
const appDot = (state?: string) =>
  state === "RUNNING" ? "ok" : state === "DEPLOYING" || state === "STOPPING" ? "warn" : state === "CRASHED" ? "bad" : "";

const HEALTH_LABEL = { ok: "healthy", warn: "warning", bad: "problem" } as const;

const STATE_LABEL: Record<string, string> = { RUNNING: "running", STOPPED: "stopped", DEPLOYING: "starting", STOPPING: "stopping", CRASHED: "crashed" };

/** The tapped app's details, and start / stop / restart when the server can do it. */
function AppDetail({ a, server }: { a: App; server: Server }) {
  const memP = pct(a.mem_used, a.mem_total);
  const hasMem = a.mem_used != null || a.mem_total != null;
  const who = [a.kind, a.id != null ? `${a.kind === "VM" || a.kind === "CT" ? "ID " : ""}${a.id}` : null].filter(Boolean).join(" · ");
  const canControl = server.kind === "proxmox" ? a.kind === "VM" || a.kind === "CT" : a.kind === "App" || (a.kind === "Docker" && !!a.id);
  return (
    <div className="app-detail" role="region" aria-label={`${a.name} details`}>
      <div className="app-detail-head">
        <span className={`dot ${appDot(a.state)}`} />
        <strong>{a.name}</strong>
        <span className="app-state">{STATE_LABEL[a.state ?? ""] ?? (a.state ?? "unknown").toLowerCase()}</span>
        {a.tags && <span className="app-tags">{a.tags}</span>}
        {who && <span className="app-who">{who}</span>}
      </div>
      {a.note && <p className={`app-note ${/update/.test(a.note) ? "" : appDot(a.state) === "ok" ? "warn" : ""}`}>{a.note}</p>}
      {(a.cpu_percent != null || hasMem || a.uptime_seconds != null) && (
        <div className="metrics app-metrics">
          {a.cpu_percent != null && <Metric label="CPU" val={`${a.cpu_percent}%`} bar={a.cpu_percent} lvl={level(a.cpu_percent)} />}
          {hasMem && <Metric label="Memory" val={a.mem_used != null ? `${bytes(a.mem_used)}${a.mem_total ? ` / ${bytes(a.mem_total)}` : ""}` : `${bytes(a.mem_total)} max`} bar={memP} lvl={level(memP)} />}
          {a.uptime_seconds != null && <Metric label="Uptime" val={dur(a.uptime_seconds)} />}
        </div>
      )}
      {a.image && (
        <p className="app-image mono" title={a.image}>
          {a.image}
        </p>
      )}
      {a.cpu_percent == null && !hasMem && a.uptime_seconds == null && !a.image && !a.note && !a.tags && <p className="app-note">This server only reports whether it&apos;s running.</p>}
      {canControl && <AppControls server={server.id} app={a} running={a.state === "RUNNING"} />}
    </div>
  );
}

export default function ServerCard({ s }: { s: Server }) {
  const st = s.stats ?? {};
  const tn = s.truenas ?? {};
  const tag = s.platform ?? (s.kind === "pi" ? "Raspberry Pi" : s.kind === "truenas" ? "TrueNAS" : "Server");
  const health = healthOf(s).level;
  const [openApp, setOpenApp] = useState<string | null>(null);

  const memP = pct(st.mem_used, st.mem_total);
  const diskP = pct(st.disk_used, st.disk_total);
  // Storage and apps come from TrueNAS, or from Proxmox and Docker on other servers.
  const pools = tn.pools ?? s.storage ?? [];
  const apps = tn.apps ?? s.apps ?? [];
  const alerts = tn.alerts ?? [];
  const infoAlerts = alerts.filter((a) => isInfoAlert(a.level));
  const realAlerts = alerts.filter((a) => !isInfoAlert(a.level));

  const head = (
    <div className="card-head">
      <div>
        <h2>
          <span className={`dot live ${health}`} />
          {s.name}
          <span className="sr-only"> ({HEALTH_LABEL[health]})</span>
        </h2>
        <div className="meta">
          {s.location}
          {st.uptime_seconds != null && ` · up ${dur(st.uptime_seconds)}`}
          {tn.version && ` · ${tn.version}`}
        </div>
        <LocalConditions weather={s.weather} tz={s.tz} />
      </div>
      {s.web_url ? (
        <a className="tag tag-link" href={s.web_url} target="_blank" rel="noopener" title={`Open ${s.name}`}>
          {tag}
          <ExternalIcon size={11} />
        </a>
      ) : (
        <span className="tag">{tag}</span>
      )}
    </div>
  );

  if (!s.reachable) {
    return (
      <article className="card" id={s.id}>
        {head}
        <div className="offline-body">
          <div className="big">Unreachable</div>
          <div>{s.error || "No response"}</div>
        </div>
        <MinecraftBlock mc={s.minecraft} server={s.id} />
        <Hardware specs={s.specs} />
      </article>
    );
  }

  const runningApps = apps.filter((a) => a.state === "RUNNING").length;
  const peak = s.cpu_history?.length ? Math.round(Math.max(...s.cpu_history)) : null;

  return (
    <article className="card" id={s.id}>
      {head}
      <div className="section">
        <h3>System</h3>
        <div className="gauges">
          <Gauge
            label="CPU"
            value={st.cpu_percent}
            unit="%"
            lvl={level(st.cpu_percent, 70, 90)}
            sub={st.cores ? `${st.cores} threads` : undefined}
          />
          <Gauge
            label="Memory"
            value={memP}
            unit="%"
            lvl={level(memP, 85, 95)}
            sub={st.mem_total ? `${bytes(st.mem_used)} / ${bytes(st.mem_total)}` : undefined}
          />
          <Gauge
            label="Temp"
            value={st.temp_c}
            max={tempMax(s.kind)}
            unit="°C"
            lvl={tempLevel(st.temp_c, s.kind)}
            sub={st.temp_c == null ? "no sensor" : `of ${tempMax(s.kind)}°C`}
          />
        </div>
        <div className="spark-wrap">
          <div className="spark-label">
            <span>
              CPU · last {Math.round((s.cpu_history?.length ?? 0) / 6) || "<1"} min
              {peak != null && ` · peak ${peak}%`}
            </span>
            {st.load && (
              <span className="mono" title="Load average over 1, 5 and 15 minutes">
                load 1m {st.load[0]} · 5m {st.load[1]} · 15m {st.load[2]}
              </span>
            )}
          </div>
          <Sparkline values={s.cpu_history} />
        </div>
        {!pools.length && st.disk_total != null && (
          <div className="metrics one">
            <Metric label="Disk" val={st.disk_total ? `${bytes(st.disk_used)} / ${bytes(st.disk_total)}` : "–"} bar={diskP} lvl={level(diskP, 80, 92)} />
          </div>
        )}
      </div>

      {tn.error && (
        <div className="section">
          <h3>TrueNAS</h3>
          <div className="err">{tn.error}</div>
        </div>
      )}
      {pools.length > 0 && (
        <div className="section">
          <h3>Storage</h3>
          {pools.map((p) => {
            const pp = pct(p.allocated, p.size);
            const bad = p.healthy === false || (!!p.status && p.status !== "ONLINE");
            return (
              <div className="pool" key={p.name}>
                <div className="pool-top">
                  <span>
                    <strong>{p.name}</strong> {bad && <span className="s err">{p.status ?? "UNHEALTHY"}</span>}
                  </span>
                  <span className="mono s">
                    {bytes(p.allocated)} / {bytes(p.size)}
                  </span>
                </div>
                <div className="bar">
                  <i className={bad ? "bad" : level(pp, 80, 90)} style={{ width: `${pp ?? 0}%` }} />
                </div>
              </div>
            );
          })}
          {infoAlerts.map((a, i) => (
            <div className="storage-note" key={i}>
              {a.text}
            </div>
          ))}
        </div>
      )}
      {apps.length > 0 && (
        <div className="section">
          <h3>
            {s.appsLabel ?? "Apps"} · {runningApps} of {apps.length} running
          </h3>
          <div className="apps">
            {apps.map((a) => (
              <button type="button" className={`app ${openApp === a.name ? "on" : ""}`} key={a.name} aria-pressed={openApp === a.name} onClick={() => setOpenApp(openApp === a.name ? null : a.name)}>
                <span className={`dot ${appDot(a.state)}`} />
                {a.name}
                {a.note && !/update/.test(a.note) && <span className="app-flag" aria-hidden="true">!</span>}
                <span className="sr-only"> ({(a.state ?? "unknown").toLowerCase()}{a.note ? `, ${a.note}` : ""})</span>
              </button>
            ))}
          </div>
          {openApp && apps.some((a) => a.name === openApp) && <AppDetail a={apps.find((a) => a.name === openApp)!} server={s} />}
        </div>
      )}
      {(realAlerts.length > 0 || (!pools.length && infoAlerts.length > 0)) && (
        <div className="section">
          <h3>Alerts</h3>
          <ul className="alerts">
            {(pools.length ? realAlerts : alerts).map((a, i) => (
              <li key={i}>
                <span className={`lvl ${a.level}`}>{a.level}</span>
                <span>{a.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <MinecraftBlock mc={s.minecraft} server={s.id} />
      <Hardware specs={s.specs} />
    </article>
  );
}
