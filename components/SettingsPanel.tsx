"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefs } from "@/lib/prefs";
import {
  ACCENTS,
  CARD_NAMES,
  FEED_CATALOG,
  LEAGUES,
  LIMITS,
  ROTATE_EVERY,
  SKINS,
  SKIN_MODE,
  SKIN_GROUPS,
  SKIN_NAMES,
  SLIDE_IDS,
  SLIDE_NAMES,
  type Accent,
  type CardPref,
  type DisplayPrefs,
  type League,
  type Look,
  type Settings,
} from "@/lib/settings";
import CardBoard from "./CardBoard";
import Switch from "./Switch";
import { EDIT_LAYOUT_EVENT } from "@/lib/useCardDrag";
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, PlusIcon } from "./icons";

// Settings: what the Home tab shows, your teams, stocks and news, the look, and the room display.
// Every change applies at once and saves itself (see lib/prefs.tsx).

const SECTIONS = [
  ["home", "Home cards"],
  ["teams", "Teams"],
  ["stocks", "Stocks"],
  ["news", "News"],
  ["look", "Look"],
  ["display", "Room display"],
] as const;
type Section = (typeof SECTIONS)[number][0];

const ACCENT_NAMES: Record<Accent, string> = {
  blue: "Blue", sky: "Sky", navy: "Navy", teal: "Teal", green: "Green", orange: "Orange", red: "Red", pink: "Pink", graphite: "Graphite",
};

const post = async (url: string, value: string) => {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
  return d;
};

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-label">
        {label}
        {hint && <span className="set-hint">{hint}</span>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={`chip ${value === v ? "on" : ""}`} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

// ---------- sections

function HomeCards({ s, set }: { s: Settings; set: (c: (s: Settings) => Settings) => void }) {
  const change = (id: CardPref["id"], patch: Partial<CardPref>) => set((x) => ({ ...x, cards: x.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  return (
    <>
      <p className="set-intro">
        Drag a card by its grip to move it. Switch one off to hide it. Or{" "}
        <button type="button" className="link-btn" onClick={() => window.dispatchEvent(new Event(EDIT_LAYOUT_EVENT))}>
          arrange them on the Home page
        </button>
        .
      </p>
      <CardBoard
        cards={s.cards}
        onChange={(cards) => set((x) => ({ ...x, cards }))}
        renderControls={(c, single) => (
          <>
            {single && (
              <Choice value={String(c.col) as "0" | "1"} label={`${CARD_NAMES[c.id]} column on wide screens`} options={[["0", "Left"], ["1", "Right"]]} onChange={(v) => change(c.id, { col: v === "1" ? 1 : 0 })} />
            )}
            <Switch on={c.on} onChange={(on) => change(c.id, { on })} label={`Show ${CARD_NAMES[c.id]}`} />
          </>
        )}
      />
      <div className="set-group">
        <Row label="Server summary" hint="The two server tiles at the top">
          <Switch on={s.serverSummary} onChange={(v) => set((x) => ({ ...x, serverSummary: v }))} label="Show server summary" />
        </Row>
        <Row label="Quick links" hint="Shortcuts row under the tabs">
          <Switch on={s.quickLinks} onChange={(v) => set((x) => ({ ...x, quickLinks: v }))} label="Show quick links" />
        </Row>
      </div>
    </>
  );
}

type TeamOption = { team: string; abbr: string; name: string; logo?: string };

function Teams({ s, set }: { s: Settings; set: (c: (s: Settings) => Settings) => void }) {
  const [lists, setLists] = useState<Partial<Record<League, TeamOption[]>>>({});
  const [league, setLeague] = useState<League>("mlb");
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const wanted = [...new Set([league, ...s.teams.map((t) => t.league)])].join(",");

  const requested = useRef(new Set<League>());
  useEffect(() => {
    for (const lg of wanted.split(",") as League[]) {
      if (requested.current.has(lg)) continue;
      requested.current.add(lg);
      fetch(`/api/settings/teams?league=${lg}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d) => setLists((l) => ({ ...l, [lg]: d.teams })))
        .catch(() => {
          requested.current.delete(lg); // try again next time
          setError("Couldn't load the team list from ESPN. Try again in a minute.");
        });
    }
  }, [wanted]);

  const find = (lg: League, team: string) => lists[lg]?.find((t) => t.team === team);
  const options = (lists[league] ?? []).filter((t) => !s.teams.some((x) => x.league === league && x.team === t.team));
  const full = s.teams.length >= LIMITS.teams;
  const add = () => {
    if (!pick) return;
    set((x) => ({ ...x, teams: [...x.teams, { league, team: pick }] }));
    setPick("");
  };

  return (
    <>
      <p className="set-intro">Scores, schedules and the room display&apos;s live scoreboard follow these teams.</p>
      {s.teams.length ? (
        <ul className="set-list">
          {s.teams.map((t) => {
            const info = find(t.league, t.team);
            return (
              <li key={`${t.league}:${t.team}`} className="set-item">
                {info?.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="team-logo" src={info.logo} alt="" width={28} height={28} loading="lazy" />
                ) : (
                  <span className="team-logo team-logo-text">{t.team.toUpperCase()}</span>
                )}
                <span className="set-item-name">
                  {info?.name ?? t.team.toUpperCase()} <span className="team-league">{LEAGUES[t.league]}</span>
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => set((x) => ({ ...x, teams: x.teams.filter((y) => !(y.league === t.league && y.team === t.team)) }))}
                  aria-label={`Remove ${info?.name ?? t.team}`}
                >
                  <CloseIcon size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="set-empty">No teams yet.</p>
      )}
      <div className="set-add">
        <Choice value={league} label="League" options={Object.entries(LEAGUES) as [League, string][]} onChange={(v) => (setLeague(v), setPick(""))} />
        <div className="set-add-row">
          <select className="field" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Team" disabled={full || !lists[league]}>
            <option value="">{lists[league] ? `Choose a ${LEAGUES[league]} team…` : "Loading teams…"}</option>
            {options.map((t) => (
              <option key={t.team} value={t.team}>
                {t.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={add} disabled={!pick || full}>
            <PlusIcon /> Add
          </button>
        </div>
        {full && <p className="set-hint">Up to {LIMITS.teams} teams.</p>}
        {error && <p className="set-error">{error}</p>}
      </div>
    </>
  );
}

function Stocks({ s, set }: { s: Settings; set: (c: (s: Settings) => Settings) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const full = s.tickers.length >= LIMITS.tickers;
  const missing = s.tickers.filter((t) => !(t in names)).join(",");
  useEffect(() => {
    if (!missing) return;
    fetch(`/api/settings/names?symbols=${encodeURIComponent(missing)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setNames((n) => ({ ...n, ...d.names })))
      .catch(() => {});
  }, [missing]);
  const move = (i: number, by: -1 | 1) =>
    set((x) => {
      const next = [...x.tickers];
      const [t] = next.splice(i, 1);
      next.splice(i + by, 0, t);
      return { ...x, tickers: next };
    });
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const sym = value.trim().toUpperCase();
    if (!sym) return;
    if (s.tickers.includes(sym)) return setMsg({ ok: false, text: `${sym} is already on the list.` });
    setBusy(true);
    setMsg(null);
    try {
      const d = await post("/api/settings/check-ticker", sym);
      set((x) => ({ ...x, tickers: [...x.tickers, d.symbol] }));
      setNames((n) => ({ ...n, [d.symbol]: d.name }));
      setMsg({ ok: true, text: `Added ${d.name ?? d.symbol}.` });
      setValue("");
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <p className="set-intro">
        The Stocks card&apos;s watchlist. Add by symbol, as on Yahoo Finance: <span className="mono">TSLA</span> (Tesla),{" "}
        <span className="mono">^GSPC</span> (S&amp;P 500; ^ means a market index), <span className="mono">BTC-USD</span> (Bitcoin).
      </p>
      {s.tickers.length ? (
        <ol className="set-list">
          {s.tickers.map((t, i) => (
            <li key={t} className="set-item">
              <span className="set-item-name">
                {names[t] ?? t}
                {names[t] && names[t] !== t && <span className="set-sym mono">{t}</span>}
              </span>
              <span className="set-move">
                <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${t} up`}>
                  <ArrowUpIcon />
                </button>
                <button type="button" className="icon-btn" disabled={i === s.tickers.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${t} down`}>
                  <ArrowDownIcon />
                </button>
                <button type="button" className="icon-btn" onClick={() => set((x) => ({ ...x, tickers: x.tickers.filter((y) => y !== t) }))} aria-label={`Remove ${t}`}>
                  <CloseIcon size={14} />
                </button>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="set-empty">No stocks yet.</p>
      )}
      <form className="set-add-row" onSubmit={add}>
        <input
          className="field mono"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Symbol, e.g. TSLA"
          aria-label="Stock symbol"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={12}
          disabled={full}
        />
        <button type="submit" className="btn" disabled={busy || !value.trim() || full}>
          {busy ? "Checking…" : <><PlusIcon /> Add</>}
        </button>
      </form>
      {msg && <p className={msg.ok ? "set-hint" : "set-error"} role="status">{msg.text}</p>}
      {full && <p className="set-hint">Up to {LIMITS.tickers} symbols.</p>}
    </>
  );
}

function News({ s, set }: { s: Settings; set: (c: (s: Settings) => Settings) => void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const on = (u: string) => s.news.some((f) => f.url === u);
  const full = s.news.length >= LIMITS.news;
  const toggle = (f: (typeof FEED_CATALOG)[number]) =>
    set((x) => ({ ...x, news: on(f.url) ? x.news.filter((y) => y.url !== f.url) : [...x.news, f].slice(0, LIMITS.news) }));
  const groups = [...new Set(FEED_CATALOG.map((f) => f.category))];
  const custom = s.news.filter((f) => !FEED_CATALOG.some((c) => c.url === f.url));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (on(url.trim())) return setMsg({ ok: false, text: "That feed is already on." });
    setBusy(true);
    setMsg(null);
    try {
      const d = await post("/api/settings/check-feed", url.trim());
      const feed = { url: d.url, source: name.trim() || d.source, category: category.trim() || "Other" };
      set((x) => ({ ...x, news: [...x.news, feed] }));
      setMsg({ ok: true, text: `Added ${feed.source}: “${d.sample}”` });
      setUrl("");
      setName("");
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="set-intro">Tap sources to turn them on or off. Each category becomes a filter on the News card.</p>
      {groups.map((g) => (
        <div key={g} className="set-feeds">
          <div className="set-feeds-cat">{g}</div>
          <div className="chips">
            {FEED_CATALOG.filter((f) => f.category === g).map((f) => (
              <button key={f.url} type="button" className={`chip ${on(f.url) ? "on" : ""}`} aria-pressed={on(f.url)} onClick={() => toggle(f)} disabled={!on(f.url) && full}>
                {f.source}
              </button>
            ))}
          </div>
        </div>
      ))}
      {custom.length > 0 && (
        <div className="set-feeds">
          <div className="set-feeds-cat">Your feeds</div>
          <ul className="set-list">
            {custom.map((f) => (
              <li key={f.url} className="set-item">
                <span className="set-item-name">
                  {f.source} <span className="team-league">{f.category}</span>
                </span>
                <button type="button" className="icon-btn" onClick={() => set((x) => ({ ...x, news: x.news.filter((y) => y.url !== f.url) }))} aria-label={`Remove ${f.source}`}>
                  <CloseIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form className="set-add set-feed-form" onSubmit={add}>
        <div className="set-feeds-cat">Add any feed</div>
        <input className="field" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/rss" aria-label="Feed address" required disabled={full} />
        <div className="set-add-row">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" aria-label="Feed name" maxLength={40} disabled={full} />
          <input className="field" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" aria-label="Category" maxLength={24} list="feed-cats" disabled={full} />
          <datalist id="feed-cats">
            {[...new Set([...groups, ...s.news.map((f) => f.category)])].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <button type="submit" className="btn" disabled={busy || !url.trim() || full}>
            {busy ? "Checking…" : <><PlusIcon /> Add</>}
          </button>
        </div>
        {msg && <p className={msg.ok ? "set-hint" : "set-error"} role="status">{msg.text}</p>}
        {full && <p className="set-hint">Up to {LIMITS.news} sources.</p>}
      </form>
    </>
  );
}

function LookSection({ s, set }: { s: Settings; set: (c: (s: Settings) => Settings) => void }) {
  const look = (patch: Partial<Look>) => set((x) => ({ ...x, look: { ...x.look, ...patch } }));
  const glass = s.look.skin === "glass";
  return (
    <>
      <div className="set-group">
        <div className="set-label">Theme</div>
        <div className="skin-groups" role="radiogroup" aria-label="Theme">
          {SKIN_GROUPS.map((g) => (
            <div key={g.name} className="skin-group" role="group" aria-label={g.name}>
              <div className="skin-group-name">{g.name}</div>
              <div className="skins">
                {g.skins.map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={s.look.skin === k} className={`skin-tile ${s.look.skin === k ? "on" : ""}`} onClick={() => look({ skin: k })}>
                    <i className={`skin-prev prev-${k}`} aria-hidden="true" />
                    <span>{SKIN_NAMES[k]}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="chip surprise"
          onClick={() => {
            const others = SKINS.filter((k) => k !== s.look.skin);
            look({ skin: others[Math.floor(Math.random() * others.length)] });
          }}
        >
          Surprise me
        </button>
        {!glass && (
          <p className="set-hint">
            Themes bring their own colors
            {{ both: ": day in light mode, night in dark mode", light: " and are always light", dark: " and are always dark" }[SKIN_MODE[s.look.skin]]}. Game-day
            colors only change the Glass theme.
          </p>
        )}
      </div>
      {glass && (
        <div className="set-group">
          <div className="set-label">Color</div>
          <div className="swatches" role="radiogroup" aria-label="Color">
            {ACCENTS.map((a) => (
              <button key={a} type="button" role="radio" aria-checked={s.look.accent === a} className={`swatch sw-${a} ${s.look.accent === a ? "on" : ""}`} onClick={() => look({ accent: a })}>
                <i />
                <span>{ACCENT_NAMES[a]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="set-group">
        {glass && (
          <Row label="Glass" hint="How see-through the cards are">
            <Choice value={s.look.glass} label="Glass" options={[["clear", "Clear"], ["frosted", "Frosted"], ["solid", "Solid"]]} onChange={(glass) => look({ glass })} />
          </Row>
        )}
        <Row label="Temperature">
          <Choice value={s.look.unit} label="Temperature unit" options={[["F", "°F"], ["C", "°C"]]} onChange={(unit) => look({ unit })} />
        </Row>
        <Row label="Clock">
          <Choice value={s.look.clock} label="Clock" options={[["12", "12-hour"], ["24", "24-hour"]]} onChange={(clock) => look({ clock })} />
        </Row>
        <Row label="Compact" hint="Tighter spacing, more on screen">
          <Switch on={s.look.compact} onChange={(compact) => look({ compact })} label="Compact layout" />
        </Row>
        <Row label="Game-day colors" hint="Turns the dashboard your team's color while they're playing">
          <Switch on={s.look.gameDay} onChange={(gameDay) => look({ gameDay })} label="Game-day colors" />
        </Row>
      </div>
      {SKIN_MODE[s.look.skin] === "both" && <p className="set-hint">Light or dark follows the button in the header.</p>}
    </>
  );
}

function DisplaySection({ s, set }: { s: Settings; set: (c: (s: Settings) => Settings) => void }) {
  const d = s.display;
  const change = (patch: Partial<DisplayPrefs>) => set((x) => ({ ...x, display: { ...x.display, ...patch } }));
  type Flag = { [K in keyof DisplayPrefs]: DisplayPrefs[K] extends boolean ? K : never }[keyof DisplayPrefs];
  const rows: [Flag, string, string?][] = [
    ["scoreboard", "Live scoreboard", "Takes over the screen while one of your teams is playing"],
    ["clock", "Clock and date"],
    ["bigClock", "Extra-big clock"],
    ["nextEvent", "Next calendar event", "Under the clock"],
    ["servers", "Servers", "CPU, memory, temperature and Minecraft (when not rotating)"],
    ["issues", "Problems", "Warnings when something needs attention"],
    ["links", "Public sites", "Up/down row at the bottom"],
  ];
  return (
    <>
      <p className="set-intro">
        The full-screen view for a spare tablet or TV. <a href="?display">Open it</a>
      </p>
      <div className="set-group">
        {rows.map(([k, label, hint]) => (
          <Row key={k} label={label} hint={hint}>
            <Switch on={d[k]} onChange={(v) => change({ [k]: v })} label={label} />
          </Row>
        ))}
      </div>
      <div className="set-group">
        <Row label="Rotating cards" hint="Flip through servers, weather, sports and more">
          <Switch on={d.rotate} onChange={(rotate) => change({ rotate })} label="Rotating cards" />
        </Row>
        {d.rotate && (
          <>
            <Row label="Change every">
              <Choice
                value={String(d.rotateEvery) as `${DisplayPrefs["rotateEvery"]}`}
                label="Change every"
                options={ROTATE_EVERY.map((n) => [String(n) as `${DisplayPrefs["rotateEvery"]}`, n < 60 ? `${n} s` : "1 min"] as const)}
                onChange={(v) => change({ rotateEvery: Number(v) as DisplayPrefs["rotateEvery"] })}
              />
            </Row>
            <div className="set-feeds">
              <div className="set-feeds-cat">Cards to show</div>
              <div className="chips">
                {SLIDE_IDS.map((id) => {
                  const on = d.slides.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`chip ${on ? "on" : ""}`}
                      aria-pressed={on}
                      onClick={() => change({ slides: on ? d.slides.filter((x) => x !== id) : SLIDE_IDS.filter((x) => x === id || d.slides.includes(x)) })}
                    >
                      {SLIDE_NAMES[id]}
                    </button>
                  );
                })}
              </div>
              {!d.slides.length && <p className="set-hint">Pick at least one, or the servers show.</p>}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, update, saveState, saveError, canSave, demo } = usePrefs();
  const [section, setSection] = useState<Section>("home");
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    window.addEventListener(EDIT_LAYOUT_EVENT, onClose);
    return () => window.removeEventListener(EDIT_LAYOUT_EVENT, onClose);
  }, [onClose]);

  const status = demo
    ? "Demo: changes aren't saved"
    : !canSave
      ? "Can't save: storage isn't connected"
      : saveState === "saving"
        ? "Saving…"
        : saveState === "saved"
          ? "Saved"
          : saveState === "error"
            ? `Couldn't save${saveError ? `: ${saveError}` : ""}`
            : "Changes save automatically";

  return (
    <dialog ref={ref} className="settings" aria-labelledby="settings-title" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="settings-panel card">
        <header className="settings-head">
          <h2 id="settings-title">Settings</h2>
          <span className={`settings-status ${saveState === "error" ? "err" : ""}`} role="status" aria-live="polite">
            {status}
          </span>
          <button type="button" className="theme-btn" onClick={onClose} aria-label="Close settings">
            <CloseIcon />
          </button>
        </header>
        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            {SECTIONS.map(([id, label]) => (
              <button key={id} type="button" className={`settings-tab ${section === id ? "on" : ""}`} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}>
                {label}
              </button>
            ))}
          </nav>
          <section className="settings-section" aria-label={SECTIONS.find(([id]) => id === section)?.[1]}>
            {section === "home" && <HomeCards s={settings} set={update} />}
            {section === "teams" && <Teams s={settings} set={update} />}
            {section === "stocks" && <Stocks s={settings} set={update} />}
            {section === "news" && <News s={settings} set={update} />}
            {section === "look" && <LookSection s={settings} set={update} />}
            {section === "display" && <DisplaySection s={settings} set={update} />}
          </section>
        </div>
      </div>
    </dialog>
  );
}
