"use client";

import { useCallback, useEffect, useState } from "react";
import { demoStatus, type DemoVariant } from "@/lib/demo";
import { healthOf, linkIssues, worst, type HealthLevel, type Issue } from "@/lib/health";
import type { Status } from "@/lib/types";
import DisplayView from "./DisplayView";
import { AutoIcon, DisplayIcon, LogoutIcon, MoonIcon, SettingsIcon, SunIcon } from "./icons";
import IssueStrip from "./IssueStrip";
import QuickLinks from "./QuickLinks";
import HomeTab from "./HomeTab";
import { GrassBlock } from "./Minecraft";
import MinecraftTab from "./MinecraftTab";
import { useCalendar } from "@/lib/useCalendar";
import { useIdleLogout } from "@/lib/useIdleLogout";
import { EDIT_LAYOUT_EVENT } from "@/lib/useCardDrag";
import { usePrefs } from "@/lib/prefs";
import SettingsPanel from "./SettingsPanel";
import { GameDayChip, useGameDay } from "./GameDay";
import { useLive } from "./Scoreboard";
import ServerCard from "./ServerCard";
import Skeleton from "./Skeleton";

// ---------- theme: follow the system, or pin light / dark (cycled by the header button)

type Theme = "system" | "light" | "dark";
const NEXT_THEME: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "system") delete root.dataset.theme;
  else root.dataset.theme = t;
  // Keep the phone status bar in step: pinned themes use the page background, "system" restores
  // the light/dark pair Next rendered into <head>.
  const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.dataset.orig ??= m.content;
    m.content = t === "system" ? m.dataset.orig : bg;
  });
  try {
    if (t === "system") localStorage.removeItem("bd-theme");
    else localStorage.setItem("bd-theme", t);
  } catch {}
}

function ThemeButton() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    if (t === "light" || t === "dark") {
      setTheme(t);
      applyTheme(t);
    }
  }, []);
  const next = NEXT_THEME[theme];
  const Icon = theme === "light" ? SunIcon : theme === "dark" ? MoonIcon : AutoIcon;
  return (
    <button
      type="button"
      className="theme-btn theme-toggle"
      title={`Theme: ${theme}`}
      aria-label={`Theme: ${theme}. Switch to ${next}`}
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
    >
      <Icon size={16} />
    </button>
  );
}

// ---------- freshness

const agoText = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`);

/**
 * Ticks every second on its own, so the rest of the page only re-renders when new data arrives.
 * Reports when the data goes stale (no new sample for 3 refresh intervals) so the header can warn.
 */
function UpdatedAgo({ updated, refresh, onStale }: { updated: number | null; refresh: number; onStale: (s: number | null) => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ago = updated == null ? null : Math.max(0, Math.round(now / 1000 - updated));
  const stale = ago != null && ago > Math.max(30, refresh * 3);
  const staleMinute = stale ? Math.floor(ago / 60) : null; // only notify the parent once a minute
  useEffect(() => onStale(staleMinute == null ? null : staleMinute * 60), [staleMinute, onStale]);
  if (ago == null) return <span className="updated mono" />;
  return (
    <span className={`updated mono ${stale ? "stale" : ""}`}>
      {stale ? `no new data · ${agoText(ago)}` : ago < 5 ? "updated just now" : `updated ${agoText(ago)} ago`}
    </span>
  );
}

// ---------- tabs (in the URL hash, so they survive reloads and can be bookmarked)

type Tab = "home" | "servers" | "minecraft";
const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "servers", label: "Servers" },
  { id: "minecraft", label: "Minecraft" },
];
const SERVER_ANCHORS = new Set(["nas", "pi", "links"]);
const tabFromHash = (): Tab => {
  const h = window.location.hash.slice(1);
  if (h === "servers" || h === "minecraft") return h;
  if (SERVER_ANCHORS.has(h)) return "servers"; // issue links jump to a server card
  return "home";
};

function useTab() {
  const [tab, setTab] = useState<Tab>("home");
  useEffect(() => {
    const sync = () => setTab(tabFromHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return tab;
}

function Tabs({ tab, minecraft, servers }: { tab: Tab; minecraft: boolean; servers: boolean }) {
  const shown = TABS.filter((t) => (minecraft || t.id !== "minecraft") && (servers || t.id !== "servers"));
  if (shown.length < 2) return null; // just Home: no tab bar
  return (
    <nav className="tabs" aria-label="Sections">
      {shown.map((t) => (
        <a key={t.id} href={t.id === "home" ? "#home" : `#${t.id}`} className={`tab ${tab === t.id ? "on" : ""}`} aria-current={tab === t.id ? "page" : undefined}>
          {t.label}
        </a>
      ))}
    </nav>
  );
}

/** "Tuesday, October 27", rendered after mount so server and browser agree. */
function Today() {
  const [s, setS] = useState("");
  useEffect(() => {
    const f = () => setS(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }));
    f();
    const t = setInterval(f, 60_000);
    return () => clearInterval(t);
  }, []);
  return <>{s || "\u00a0"}</>;
}

// Cards catch extra light where the cursor is: feed the pointer position to CSS.
function trackLight(e: React.PointerEvent) {
  const card = (e.target as HTMLElement).closest<HTMLElement>(".card");
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty("--mx", `${e.clientX - r.left}px`);
  card.style.setProperty("--my", `${e.clientY - r.top}px`);
}

export default function Dashboard({
  demo, display = false, quickLinks = [],
}: { demo: DemoVariant | null; display?: boolean; quickLinks?: { name: string; url: string }[] }) {
  const [data, setData] = useState<Status | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [staleFor, setStaleFor] = useState<number | null>(null);
  const calendar = useCalendar(!!demo);
  const hashTab = useTab();
  // The Minecraft tab only shows when a server has one configured.
  const hasMinecraft = !!data?.servers.some((s) => s.minecraft);
  // Servers are optional: with none set up (and no endpoints to check) it's a plain home dashboard.
  const monitoring = !data?.updated || data.servers.length > 0 || data.links.length > 0;
  const tab = (hashTab === "minecraft" && data && !hasMinecraft) || (hashTab === "servers" && !monitoring) ? "home" : hashTab;
  useIdleLogout(!demo, display);
  const { settings } = usePrefs();
  // Your teams' games: for game-day colors everywhere and the room display's scoreboard.
  const games = useLive(settings.look.gameDay || (display && settings.display.scoreboard), !!demo);
  useGameDay(games);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Home's edit layout mode; also opened from Settings → Home cards.
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const open = () => {
      if (window.location.hash && window.location.hash !== "#home") window.location.hash = "home";
      setEditing(true);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener(EDIT_LAYOUT_EVENT, open);
    return () => window.removeEventListener(EDIT_LAYOUT_EVENT, open);
  }, []);
  useEffect(() => {
    if (tab !== "home") setEditing(false);
  }, [tab]);
  const stopEditing = useCallback(() => setEditing(false), []);
  const settingsButton = (
    <button type="button" className="theme-btn" title="Settings" aria-label="Settings" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}>
      <SettingsIcon />
    </button>
  );
  const settingsPanel = <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />;

  // Poll the backend (or regenerate sample data in demo mode).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const poll = async () => {
      clearTimeout(timer);
      if (document.hidden) return; // resumed by the visibilitychange listener below
      if (demo) {
        setData(demoStatus(demo));
        timer = setTimeout(poll, 10000);
        return;
      }
      try {
        const r = await fetch("/api/status", { cache: "no-store" });
        if (r.status === 401) return window.location.reload(); // signed out: show the login page
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d: Status = await r.json();
        if (cancelled) return;
        setBackendError(null);
        setData(d);
        timer = setTimeout(poll, (d.refresh || 10) * 1000);
      } catch (e) {
        if (cancelled) return;
        setBackendError((e as Error).message);
        timer = setTimeout(poll, 5000);
      }
    };
    const onVisible = () => !document.hidden && poll();
    document.addEventListener("visibilitychange", onVisible);
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [demo]);

  const ready = !!data?.updated;
  const issues: Issue[] = ready ? [...data.servers.flatMap((s) => healthOf(s).issues), ...linkIssues(data.links)] : [];
  if (ready && staleFor != null) {
    issues.unshift({
      level: "warn",
      text: `No new data for ${staleFor < 60 ? "over 30 seconds" : `over ${staleFor / 60} min`}, so these numbers may be out of date`,
      detail: backendError ? undefined : data.backup ? "neither server has reported to the backup" : "the collector may be stuck; check the app's logs",
    });
  }
  issues.sort((a, b) => Number(a.level !== "bad") - Number(b.level !== "bad")); // problems before warnings
  const overall: HealthLevel | "" = backendError ? "bad" : ready ? worst(issues) : "";
  const overallText = !data
    ? "Loading…"
    : !ready
      ? "Collecting first sample…"
      : issues.length === 0
        ? "All systems normal"
        : `${issues.length} ${issues.length === 1 ? "issue" : "issues"}`; // the strip below says what they are

  const [first, ...rest] = data?.servers ?? [];
  const demoQuery = demo ? (demo === "normal" ? "demo" : `demo=${demo}`) : "";
  const displayHref = `?${[demoQuery, "display"].filter(Boolean).join("&")}`;
  const exitHref = demoQuery ? `?${demoQuery}` : "/";

  if (display) {
    return (
      <div onPointerMove={trackLight}>
        <DisplayView
          data={ready ? data : null}
          issues={issues}
          overall={overall}
          overallText={overallText}
          backendError={backendError}
          exitHref={exitHref}
          calendar={calendar}
          settingsButton={settingsButton}
          demo={!!demo}
          games={games}
          monitoring={monitoring}
        />
        {settingsPanel}
      </div>
    );
  }

  return (
    <div className="wrap" onPointerMove={trackLight}>
      <header className="top" id="top">
        <div className="brand">
          {settings.look.skin === "blocks" ? (
            <span className="logo logo-block" aria-hidden="true">
              <GrassBlock />
            </span>
          ) : settings.look.skin === "handheld" ? (
            <span className="logo logo-lens" aria-hidden="true" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="logo" src="/brand/icon.svg" alt="" width={44} height={44} />
          )}
          <div>
            <h1>Homebase</h1>
            <div className="sub">{data?.backup ? "Backup copy · updates every 30 s" : <Today />}</div>
          </div>
        </div>
        <div className="overall">
          <GameDayChip games={games} />
          {monitoring && (
            <span className={`pill ${overall ? "state-" + overall : ""}`}>
              <span className={`dot live ${overall}`} />
              <span className="pill-text" aria-live="polite">
                {overallText}
              </span>
            </span>
          )}
          {monitoring && <UpdatedAgo updated={ready ? data.updated : null} refresh={data?.refresh ?? 10} onStale={setStaleFor} />}
          <a className="theme-btn" href={displayHref} title="Display mode" aria-label="Open display mode">
            <DisplayIcon size={16} />
          </a>
          <ThemeButton />
          {settingsButton}
          {!demo && (
            <button
              type="button"
              className="theme-btn"
              title="Sign out"
              aria-label="Sign out"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
                window.location.replace("/login");
              }}
            >
              <LogoutIcon />
            </button>
          )}
        </div>
      </header>

      <Tabs tab={tab} minecraft={hasMinecraft} servers={monitoring} />

      {tab === "home" && settings.quickLinks && <QuickLinks links={quickLinks} />}

      {backendError && (
        <div className="banner show" role="alert">
          Can&apos;t reach the dashboard backend ({backendError}). Retrying every 5 seconds…
        </div>
      )}

      {ready && <IssueStrip issues={issues} />}

      {tab === "home" && <HomeTab status={ready ? data : null} calendar={calendar} demo={!!demo} editing={editing} onEdit={() => setEditing(true)} onEditDone={stopEditing} />}

      {tab !== "home" && !ready && !backendError && <Skeleton />}

      {tab === "minecraft" && ready && <MinecraftTab data={data} />}

      {tab === "servers" && ready && (
        <div className="grid">
          <div className="col">{first && <ServerCard s={first} />}</div>
          <div className="col">
            {rest.map((s) => (
              <ServerCard key={s.id} s={s} />
            ))}
            {data.links.length > 0 && (
              <section className="card endpoints" id="links">
                <h3>Public endpoints</h3>
                <div className="link-list">
                  {data.links.map((l) => (
                    <a className="link" key={l.url} href={l.url} target="_blank" rel="noopener">
                      <span className={`dot ${l.up ? "ok" : "bad"}`} />
                      <span className="lname">{l.name}</span>
                      <span className="ms mono">{l.up ? `${l.ms} ms` : "down"}</span>
                      <span className="sr-only"> ({l.up ? "up" : "down"}, opens in a new tab)</span>
                    </a>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
      {settingsPanel}
    </div>
  );
}
