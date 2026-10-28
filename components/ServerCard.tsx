import { bytes, dur, level, pct, tempLevel, type Level } from "@/lib/format";
import { healthOf, isInfoAlert, tempMax } from "@/lib/health";
import type { Server, Spec } from "@/lib/types";
import { ExternalIcon } from "./icons";
import MinecraftBlock from "./Minecraft";
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

export default function ServerCard({ s }: { s: Server }) {
  const st = s.stats ?? {};
  const tn = s.truenas ?? {};
  const tag = s.kind === "pi" ? "Raspberry Pi 5" : "TrueNAS";
  const health = healthOf(s).level;

  const memP = pct(st.mem_used, st.mem_total);
  const diskP = pct(st.disk_used, st.disk_total);
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
        <MinecraftBlock mc={s.minecraft} />
        <Hardware specs={s.specs} />
      </article>
    );
  }

  const runningApps = tn.apps?.filter((a) => a.state === "RUNNING").length ?? 0;
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
        {s.kind === "pi" && (
          <div className="metrics one">
            <Metric label="Disk" val={st.disk_total ? `${bytes(st.disk_used)} / ${bytes(st.disk_total)}` : "–"} bar={diskP} lvl={level(diskP, 80, 92)} />
          </div>
        )}
      </div>

      {s.kind === "truenas" && (
        <>
          {tn.error && (
            <div className="section">
              <h3>TrueNAS</h3>
              <div className="err">{tn.error}</div>
            </div>
          )}
          {!!tn.pools?.length && (
            <div className="section">
              <h3>Storage</h3>
              {tn.pools.map((p) => {
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
          {!!tn.apps?.length && (
            <div className="section">
              <h3>
                Apps · {runningApps} of {tn.apps.length} running
              </h3>
              <div className="apps">
                {tn.apps.map((a) => (
                  <span className="app" key={a.name}>
                    <span className={`dot ${appDot(a.state)}`} />
                    {a.name}
                    <span className="sr-only"> ({(a.state ?? "unknown").toLowerCase()})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {(realAlerts.length > 0 || (!tn.pools?.length && infoAlerts.length > 0)) && (
            <div className="section">
              <h3>Alerts</h3>
              <ul className="alerts">
                {(tn.pools?.length ? realAlerts : alerts).map((a, i) => (
                  <li key={i}>
                    <span className={`lvl ${a.level}`}>{a.level}</span>
                    <span>{a.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <MinecraftBlock mc={s.minecraft} />
      <Hardware specs={s.specs} />
    </article>
  );
}
