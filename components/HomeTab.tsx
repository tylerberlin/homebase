"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CalendarData } from "@/lib/calendar";
import { usePrefs } from "@/lib/prefs";
import { CARD_NAMES, CARD_SIZE, GRID_MAX_H, type CardId, type CardPref } from "@/lib/settings";
import type { Status } from "@/lib/types";
import { Grip } from "@/lib/useCardDrag";
import { useHome, useNow } from "@/lib/useHome";
import { useWeatherLocation } from "@/lib/useWeatherLocation";
import ClockCard from "./home/ClockCard";
import CountdownsCard from "./home/CountdownsCard";
import NowPlayingCard from "./home/NowPlayingCard";
import MarketsCard from "./home/MarketsCard";
import NewsCard from "./home/NewsCard";
import ServerSummary from "./home/ServerSummary";
import SportsCard from "./home/SportsCard";
import WeatherCard from "./home/WeatherCard";
import Switch from "./Switch";
import Upcoming from "./Upcoming";

// The Home tab is a widget grid: 4 columns on a computer, 2 on a tablet, 1 on a phone. Each card
// has a width in columns and fits its content's height. A height set by dragging the corner (in
// 72px steps; double-click to fit again) is a limit: the card scrolls inside past it, but never
// stands taller than its content. The grid packs cards in order in
// fine 8px rows, so they sit close with few gaps. A card set smaller than its content scrolls
// inside. On a phone cards stack at their natural height.

const ROW = 56; // a height step is ROW + the 16px gap
const FINE = 8; // grid-auto-rows in .home-grid.free
const GAP = 16; // the space under each card (padding in the slot, since rows have no gap)
const EDIT_GAP = 34; // more room while editing, for each card's controls and corner handle
const STEP = (ROW + GAP) / FINE; // fine rows per height step
// The pointer position lives in refs and moves the floating card directly, so dragging never
// re-renders the page; state only changes when a card swaps places or snaps to a new size.
type Drag = { id: CardId; pointerId: number; target: number; dx: number; dy: number; w: number; h: number };
type Resize = { id: CardId; pointerId: number; left: number; top: number; colW: number; gap: number; cols: number; w: number; h: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function HomeTab({
  status, calendar, demo, editing, onEdit, onEditDone,
}: {
  status: Status | null;
  calendar: CalendarData | null;
  demo: boolean;
  editing: boolean;
  onEdit: () => void;
  onEditDone: () => void;
}) {
  const { settings: s, update } = usePrefs();
  const loc = useWeatherLocation();
  // Refetch when what the Home data depends on changes in Settings.
  const key = JSON.stringify([s.teams, s.tickers, s.news, s.look.unit]);
  const home = useHome(true, loc.mode === "here" ? loc.coords : null, key);
  const now = useNow();
  const doneRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const slots = useRef(new Map<CardId, HTMLElement>());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [resize, setResize] = useState<Resize | null>(null);
  const [said, setSaid] = useState("");
  // Fine rows each fitted card needs, measured from its content.
  const [fit, setFit] = useState<Partial<Record<CardId, number>>>({});
  const gapRef = useRef(GAP);
  gapRef.current = editing ? EDIT_GAP : GAP;

  useEffect(() => {
    if (!editing) return;
    doneRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onEditDone();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, onEditDone]);

  const cardFor = (id: CardId) => {
    switch (id) {
      case "clock":
        return <ClockCard status={status} />;
      case "weather":
        return <WeatherCard w={home?.weather} loc={loc} />;
      case "music":
        return <NowPlayingCard demo={!!demo} />;
      case "news":
        return now != null && home ? <NewsCard headlines={home.headlines} now={now} /> : null;
      case "calendar":
        return <Upcoming data={calendar} />;
      case "countdowns":
        return now != null ? <CountdownsCard now={now} demo={demo} /> : null;
      case "sports":
        return now != null && home ? <SportsCard teams={home.teams} now={now} demo={!!demo} /> : null;
      case "markets":
        return home ? <MarketsCard quotes={home.quotes} /> : null;
    }
  };

  // Built once per data change, so reordering and resizing don't re-render the cards themselves.
  const content = useMemo(
    () => Object.fromEntries(s.cards.map((c) => [c.id, cardFor(c.id)])) as Record<CardId, React.ReactNode>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, calendar, home, now, loc.mode, loc.coords, demo, s.cards.length],
  );
  const card = (id: CardId) => content[id];

  const save = (cards: CardPref[]) => update((x) => ({ ...x, cards }));
  const shownBase = s.cards.filter((c) => c.on);
  const hidden = s.cards.filter((c) => !c.on);

  // While moving, show the cards in the order they'd land; while resizing, at the new size.
  let shown = shownBase;
  if (drag) {
    const rest = shownBase.filter((c) => c.id !== drag.id);
    const moving = shownBase.find((c) => c.id === drag.id)!;
    shown = [...rest.slice(0, drag.target), moving, ...rest.slice(drag.target)];
  }
  const ghostRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  if (resize) shown = shown.map((c) => (c.id === resize.id ? { ...c, w: resize.w, h: resize.h } : c));
  const commitOrder = (list: CardPref[]) => save([...list, ...hidden]);

  const latest = useRef({ drag, resize, shownBase, shown });
  latest.current = { drag, resize, shownBase, shown };

  const span = (c: CardPref) => {
    const natural = fit[c.id] ?? CARD_SIZE[c.id].h * STEP;
    if (!c.h) return natural;
    const set = c.h * STEP + (editing ? (EDIT_GAP - GAP) / FINE : 0);
    // While resizing, show the exact size being picked; otherwise never taller than the content.
    return resize?.id === c.id ? set : Math.min(set, natural);
  };
  const slotStyle = (c: CardPref) => ({ gridRow: `span ${span(c)}` });
  /** A set height shorter than the content: the card fills its slot and scrolls. */
  const clipped = (c: CardPref) => !!c.h && resize?.id !== c.id && c.h * STEP < (fit[c.id] ?? Infinity);

  // Measure fitted cards whenever their content changes size.
  const observer = useRef<ResizeObserver | null>(null);
  const watched = useRef(new WeakSet<Element>());
  const mutations = useRef<MutationObserver | null>(null);
  useLayoutEffect(() => {
    observer.current ??= new ResizeObserver((entries) => {
      setFit((prev) => {
        let next = prev;
        for (const e of entries) {
          const id = (e.target.closest(".home-slot") as HTMLElement | null)?.dataset.id as CardId | undefined;
          if (!id) continue;
          const el = e.target as HTMLElement;
          // scrollHeight: the content's full height, even when a set height cuts the card short
          const rows = Math.ceil((Math.max(el.offsetHeight, el.scrollHeight) + gapRef.current) / FINE);
          if (rows > 2 && next[id] !== rows) next = { ...next, [id]: rows };
        }
        return next;
      });
    });
    const watch = () => {
      for (const el of slots.current.values()) {
        const body = el.querySelector(":scope > .card, :scope > .edit-body");
        if (body && !watched.current.has(body)) {
          watched.current.add(body);
          observer.current!.observe(body);
        }
      }
    };
    watch();
    // A card can show up later on its own (Now playing, once something plays) without this
    // component re-rendering, so also watch each slot for its card appearing.
    mutations.current ??= new MutationObserver(watch);
    for (const el of slots.current.values()) {
      if (!watched.current.has(el)) {
        watched.current.add(el);
        mutations.current.observe(el, { childList: true });
      }
    }
  });
  useEffect(
    () => () => {
      // Start over cleanly if mounted again (React does this once in development).
      observer.current?.disconnect();
      mutations.current?.disconnect();
      observer.current = mutations.current = null;
      watched.current = new WeakSet();
    },
    [],
  );

  // Cards glide to their new places (FLIP): measure where each was, then animate from there.
  const prevPos = useRef(new Map<CardId, { x: number; y: number }>());
  const layoutKey = shown.map((c) => `${c.id}:${c.w}:${c.h}`).join();
  useLayoutEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<CardId, { x: number; y: number }>();
    for (const [id, el] of slots.current) {
      const pos = { x: el.offsetLeft, y: el.offsetTop };
      next.set(id, pos);
      const was = prevPos.current.get(id);
      if (!was || reduce) continue;
      const dx = was.x - pos.x, dy = was.y - pos.y;
      if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 240, easing: "cubic-bezier(.2, .8, .2, 1)" });
    }
    prevPos.current = next;
  }, [layoutKey, editing]);

  // Follow the pointer on the window while moving or resizing.
  const active = drag?.id ?? resize?.id;
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    /** The card under the pointer, by where cards sit in the grid (not mid-animation). */
    const cardAt = (x: number, y: number) => {
      const g = gridRef.current?.getBoundingClientRect();
      if (!g) return null;
      for (const c of latest.current.shown) {
        const el = slots.current.get(c.id), pos = prevPos.current.get(c.id);
        if (!el || !pos) continue;
        const left = g.left + pos.x, top = g.top + pos.y;
        if (x >= left && x <= left + el.offsetWidth && y >= top && y <= top + el.offsetHeight) return c.id;
      }
      return null;
    };
    const place = () => {
      const d = latest.current.drag, el = ghostRef.current;
      if (d && el) el.style.transform = `translate(${pointer.current.x - d.dx}px, ${pointer.current.y - d.dy}px) rotate(1.5deg)`;
    };
    const move = (e: PointerEvent) => {
      const { drag: d, resize: z, shown: list } = latest.current;
      if (d && e.pointerId === d.pointerId) {
        pointer.current = { x: e.clientX, y: e.clientY };
        // Hovering another card swaps the held one into its place.
        const over = cardAt(e.clientX, e.clientY);
        if (over && over !== d.id) {
          const rest = list.filter((c) => c.id !== d.id);
          const to = list.findIndex((c) => c.id === over);
          if (to !== d.target && to >= 0 && to <= rest.length) setDrag({ ...d, target: to });
        }
      }
      if (z && e.pointerId === z.pointerId) {
        const size = CARD_SIZE[z.id];
        const w = clamp(Math.round((e.clientX - z.left + z.gap) / (z.colW + z.gap)), size.minW, z.cols);
        const h = clamp(Math.round((e.clientY - z.top + z.gap) / (ROW + z.gap)), size.minH, GRID_MAX_H);
        if (w !== z.w || h !== z.h) setResize({ ...z, w, h });
      }
    };
    const up = (e: PointerEvent) => {
      const { drag: d, resize: z, shown: list } = latest.current;
      if (d && e.pointerId === d.pointerId) {
        setDrag(null);
        commitOrder(list);
      }
      if (z && e.pointerId === z.pointerId) {
        setResize(null);
        commitOrder(list);
      }
    };
    const cancel = () => {
      setDrag(null);
      setResize(null);
    };
    // Each frame: move the floating card, and scroll along near the top or bottom edge.
    const frame = () => {
      place();
      if (latest.current.drag) {
        const { y } = pointer.current, edge = 90;
        const v = y < edge ? -(edge - y) / 4 : y > innerHeight - edge ? (y - (innerHeight - edge)) / 4 : 0;
        if (v) window.scrollBy(0, v);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const gridInfo = () => {
    const g = gridRef.current!;
    const cs = getComputedStyle(g);
    const cols = cs.gridTemplateColumns.split(" ").length;
    const gap = parseFloat(cs.columnGap) || 16;
    return { cols, gap, colW: (g.clientWidth - gap * (cols - 1)) / cols };
  };

  const beginMove = (id: CardId, pointerId: number, x: number, y: number) => {
    const r = slots.current.get(id)?.getBoundingClientRect();
    if (!r) return;
    pointer.current = { x, y };
    setDrag({ id, pointerId, target: shownBase.findIndex((c) => c.id === id), dx: x - r.left, dy: y - r.top, w: r.width, h: r.height });
  };

  /** Pick a card up from anywhere on it: with a mouse once it moves a few pixels (so clicks still
   *  work), with a finger after a short press-and-hold (so a swipe still scrolls). */
  const press = (e: React.PointerEvent, c: CardPref) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, a, input, select, [role=switch], .resize")) return;
    const id = e.pointerId, x0 = e.clientX, y0 = e.clientY, touch = e.pointerType === "touch";
    let started = false;
    const timer = touch
      ? setTimeout(() => {
          started = true;
          navigator.vibrate?.(8);
          beginMove(c.id, id, x0, y0);
        }, 280)
      : undefined;
    const mv = (ev: PointerEvent) => {
      if (ev.pointerId !== id || started) return;
      const far = Math.hypot(ev.clientX - x0, ev.clientY - y0);
      if (touch && far > 8) done();
      if (!touch && far > 4) {
        started = true;
        beginMove(c.id, id, ev.clientX, ev.clientY);
      }
    };
    const noScroll = (ev: TouchEvent) => started && ev.cancelable && ev.preventDefault();
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", done);
      window.removeEventListener("pointercancel", done);
      document.removeEventListener("touchmove", noScroll);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", done);
    window.addEventListener("pointercancel", done);
    document.addEventListener("touchmove", noScroll, { passive: false });
  };

  const startResize = (e: React.PointerEvent, c: CardPref) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const r = slots.current.get(c.id)!.getBoundingClientRect();
    const g = gridInfo();
    const size = CARD_SIZE[c.id];
    setResize({ id: c.id, pointerId: e.pointerId, left: r.left, top: r.top, ...g, w: Math.min(c.w, g.cols), h: c.h || clamp(Math.round(span(c) / STEP), size.minH, GRID_MAX_H) });
  };

  /** Keyboard: arrows on the grip move a card; arrows on the corner resize it. */
  const onMoveKey = (e: React.KeyboardEvent, c: CardPref) => {
    const i = shownBase.findIndex((x) => x.id === c.id);
    const to = e.key === "ArrowLeft" || e.key === "ArrowUp" ? i - 1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? i + 1 : -2;
    if (to < 0 || to >= shownBase.length) return;
    e.preventDefault();
    const rest = shownBase.filter((x) => x.id !== c.id);
    commitOrder([...rest.slice(0, to), c, ...rest.slice(to)]);
    setSaid(`${CARD_NAMES[c.id]}: position ${to + 1} of ${shownBase.length}`);
    requestAnimationFrame(() => slots.current.get(c.id)?.querySelector<HTMLElement>(".grip")?.focus());
  };
  const onSizeKey = (e: React.KeyboardEvent, c: CardPref) => {
    const size = CARD_SIZE[c.id], { cols } = gridInfo();
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const w = clamp(Math.min(c.w, cols) + d[0], size.minW, cols), h = clamp((c.h || Math.round(span(c) / STEP)) + d[1], size.minH, GRID_MAX_H);
    save(s.cards.map((x) => (x.id === c.id ? { ...x, w, h } : x)));
    setSaid(`${CARD_NAMES[c.id]}: ${w} wide, ${h} tall`);
  };

  const toggle = (c: CardPref, on: boolean) => save(s.cards.map((y) => (y.id === c.id ? { ...y, on } : y)));
  const slotRef = (id: CardId) => (el: HTMLElement | null) => void (el ? slots.current.set(id, el) : slots.current.delete(id));

  if (editing) {
    const dragged = drag ? shownBase.find((c) => c.id === drag.id) : null;
    return (
      <>
        <div className="edit-bar card" role="region" aria-label="Edit layout">
          <span className="edit-bar-text">
            <strong>Edit layout</strong>
            <span>Drag a card to move it. Drag its corner to resize it. Switch one off to hide it.</span>
          </span>
          <span className="settings-status edit-status" aria-live="polite">
            {demo ? "Demo: not saved" : ""}
          </span>
          <button ref={doneRef} type="button" className="btn" onClick={onEditDone}>
            Done
          </button>
        </div>
        <div ref={gridRef} className={`grid home-grid free editing ${drag ? "dragging" : ""} ${resize ? "resizing" : ""}`}>
          {shown.map((c) => {
            const held = drag?.id === c.id;
            const sizing = resize?.id === c.id;
            return (
              <div
                key={c.id}
                ref={slotRef(c.id)}
                className={`home-slot edit-tile ${held ? "placeholder" : ""} ${sizing ? "sizing" : ""}`}
                data-id={c.id}
                data-w={c.w}
                data-fit={c.h ? undefined : ""}
                data-clip={clipped(c) ? "" : undefined}
                style={slotStyle(c)}
                onPointerDown={held ? undefined : (e) => press(e, c)}
              >
                {!held && (
                  <>
                    <div className="edit-ctrl">
                      <button
                        type="button"
                        className="grip"
                        aria-label={`Move ${CARD_NAMES[c.id]}`}
                        aria-describedby="edit-help"
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.preventDefault();
                          e.stopPropagation();
                          beginMove(c.id, e.pointerId, e.clientX, e.clientY);
                        }}
                        onKeyDown={(e) => onMoveKey(e, c)}
                      >
                        <Grip size={16} />
                      </button>
                      <Switch on={c.on} onChange={(on) => toggle(c, on)} label={`Show ${CARD_NAMES[c.id]}`} />
                    </div>
                    {/* Empty when the card has nothing to show yet; CSS then shows its name. */}
                    <div className="edit-body" inert data-name={CARD_NAMES[c.id]}>
                      {card(c.id)}
                    </div>
                    {sizing && (
                      <span className="size-badge mono" aria-hidden="true">
                        {resize!.w} wide × {resize!.h} tall
                      </span>
                    )}
                    <button
                      type="button"
                      className="resize"
                      aria-label={`Resize ${CARD_NAMES[c.id]}, ${c.w} wide and ${c.h} tall`}
                      aria-describedby="resize-help"
                      onPointerDown={(e) => startResize(e, c)}
                      onDoubleClick={() => {
                        save(s.cards.map((x) => (x.id === c.id ? { ...x, h: 0 } : x)));
                        setSaid(`${CARD_NAMES[c.id]} fits its content`);
                      }}
                      title="Drag to resize · double-click to fit the content"
                      onKeyDown={(e) => onSizeKey(e, c)}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                        <path d="M13 5v8H5M13 9v4H9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {hidden.length > 0 && (
          <div className="edit-hidden-row" aria-label="Hidden cards">
            {hidden.map((c) => (
              <div key={c.id} className="edit-off">
                {CARD_NAMES[c.id]} <span className="edit-hidden">Hidden</span>
                <Switch on={false} onChange={(on) => toggle(c, on)} label={`Show ${CARD_NAMES[c.id]}`} />
              </div>
            ))}
          </div>
        )}
        {drag &&
          dragged &&
          createPortal(
            <div
              ref={ghostRef}
              className="edit-ghost"
              style={{ width: drag.w, height: drag.h, transform: `translate(${pointer.current.x - drag.dx}px, ${pointer.current.y - drag.dy}px) rotate(1.5deg)` }}
              aria-hidden="true"
            >
              <div className="edit-body">{card(dragged.id)}</div>
            </div>,
            document.body,
          )}
        <p id="edit-help" className="sr-only">Use the arrow keys to move the card earlier or later.</p>
        <p id="resize-help" className="sr-only">Use the arrow keys to make the card wider, narrower, taller or shorter. Double-click to fit its content.</p>
        <p className="sr-only" aria-live="polite">{said}</p>
      </>
    );
  }

  return (
    <>
      {s.serverSummary && <ServerSummary data={status} />}
      {shown.length > 0 ? (
        <div ref={gridRef} className="grid home-grid free">
          {shown.map((c) => (
            <div key={c.id} ref={slotRef(c.id)} className="home-slot" data-id={c.id} data-w={c.w} data-fit={c.h ? undefined : ""} data-clip={clipped(c) ? "" : undefined} style={slotStyle(c)}>
              {card(c.id)}
            </div>
          ))}
        </div>
      ) : (
        <div className="card home-card cd-empty">All Home cards are hidden. Use Edit layout below to bring some back.</div>
      )}
      <div className="edit-open">
        <button type="button" className="chip" onClick={onEdit}>
          <Grip size={12} /> Edit layout
        </button>
      </div>
    </>
  );
}
