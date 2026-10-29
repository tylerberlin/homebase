"use client";

import { useEffect, useRef, useState } from "react";
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
import MarketsCard from "./home/MarketsCard";
import NewsCard from "./home/NewsCard";
import ServerSummary from "./home/ServerSummary";
import SportsCard from "./home/SportsCard";
import WeatherCard from "./home/WeatherCard";
import Switch from "./Switch";
import Upcoming from "./Upcoming";

// The Home tab is a widget grid: 4 columns on a computer, 2 on a tablet, 1 on a phone. Each card
// has a width (columns) and height (rows) and the grid packs them in order, filling gaps. In Edit
// layout you drag a card to move it and drag its corner to resize it, in whole grid steps. A card
// smaller than its content scrolls inside. On a phone cards stack at their natural height.

const ROW = 56; // must match grid-auto-rows in .home-grid.free
type Drag = { id: CardId; pointerId: number; x: number; y: number; target: number };
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

  useEffect(() => {
    if (!editing) return;
    doneRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onEditDone();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, onEditDone]);

  const card = (id: CardId) => {
    switch (id) {
      case "clock":
        return <ClockCard status={status} />;
      case "weather":
        return <WeatherCard w={home?.weather} loc={loc} />;
      case "news":
        return now != null && home ? <NewsCard headlines={home.headlines} now={now} /> : null;
      case "calendar":
        return <Upcoming data={calendar} />;
      case "countdowns":
        return now != null ? <CountdownsCard now={now} demo={demo} /> : null;
      case "sports":
        return now != null && home ? <SportsCard teams={home.teams} now={now} /> : null;
      case "markets":
        return home ? <MarketsCard quotes={home.quotes} /> : null;
    }
  };

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
  if (resize) shown = shown.map((c) => (c.id === resize.id ? { ...c, w: resize.w, h: resize.h } : c));
  const commitOrder = (list: CardPref[]) => save([...list, ...hidden]);

  const latest = useRef({ drag, resize, shownBase, shown });
  latest.current = { drag, resize, shownBase, shown };

  // Follow the pointer on the window while moving or resizing.
  const active = drag?.id ?? resize?.id;
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const targetAt = (x: number, y: number, id: CardId) => {
      const others = latest.current.shownBase.filter((c) => c.id !== id);
      let best = others.length, bestD = Infinity;
      others.forEach((c, i) => {
        const r = slots.current.get(c.id)?.getBoundingClientRect();
        if (!r) return;
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          best = x < r.left + r.width / 2 ? i : i + 1;
          bestD = -1;
        } else if (bestD >= 0) {
          const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
          if (d < bestD) [bestD, best] = [d, y < r.top + r.height / 2 ? i : i + 1];
        }
      });
      return best;
    };
    const move = (e: PointerEvent) => {
      const { drag: d, resize: z } = latest.current;
      if (d && e.pointerId === d.pointerId) setDrag({ ...d, x: e.clientX, y: e.clientY, target: targetAt(e.clientX, e.clientY, d.id) });
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
    // Scroll along when the pointer is held near the top or bottom edge.
    const scroll = () => {
      const d = latest.current.drag;
      if (d) {
        const edge = 90;
        const v = d.y < edge ? -(edge - d.y) / 4 : d.y > innerHeight - edge ? (d.y - (innerHeight - edge)) / 4 : 0;
        if (v) window.scrollBy(0, v);
      }
      raf = requestAnimationFrame(scroll);
    };
    raf = requestAnimationFrame(scroll);
    window.addEventListener("pointermove", move);
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

  const beginMove = (id: CardId, pointerId: number, x: number, y: number) =>
    setDrag({ id, pointerId, x, y, target: shownBase.findIndex((c) => c.id === id) });

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
    setResize({ id: c.id, pointerId: e.pointerId, left: r.left, top: r.top, ...g, w: Math.min(c.w, g.cols), h: c.h });
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
    const w = clamp(Math.min(c.w, cols) + d[0], size.minW, cols), h = clamp(c.h + d[1], size.minH, GRID_MAX_H);
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
                data-w={c.w}
                data-h={c.h}
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
                        {resize!.w} × {resize!.h}
                      </span>
                    )}
                    <button
                      type="button"
                      className="resize"
                      aria-label={`Resize ${CARD_NAMES[c.id]}, ${c.w} wide and ${c.h} tall`}
                      aria-describedby="resize-help"
                      onPointerDown={(e) => startResize(e, c)}
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
            <div className="edit-float" style={{ transform: `translate(${drag.x - 24}px, ${drag.y - 22}px)` }} aria-hidden="true">
              <Grip size={16} /> {CARD_NAMES[dragged.id]}
            </div>,
            document.body,
          )}
        <p id="edit-help" className="sr-only">Use the arrow keys to move the card earlier or later.</p>
        <p id="resize-help" className="sr-only">Use the arrow keys to make the card wider, narrower, taller or shorter.</p>
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
            <div key={c.id} ref={slotRef(c.id)} className="home-slot" data-w={c.w} data-h={c.h}>
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
