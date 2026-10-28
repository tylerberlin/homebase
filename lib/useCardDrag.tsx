"use client";

import { useEffect, useRef, useState } from "react";
import { CARD_NAMES, type CardId, type CardPref } from "./settings";

// Drag-to-arrange for the Home cards, shared by Settings → Home cards and the Home tab's edit mode.
// Two columns on wide screens (drop a card in the other column to move it there), one list when
// narrow. Pointer events, so touch and mouse both work; with the keyboard, focus a grip and use
// the arrow keys. Near the top or bottom of the screen the page scrolls along while dragging.
// `start` picks a card up from a grip at once; `press` from anywhere on the card (see below).

/** Fired by Settings → "arrange them on the Home page"; the dashboard opens Home in edit mode. */
export const EDIT_LAYOUT_EVENT = "bd-edit-layout";

export type Target = { col: 0 | 1; index: number };
export type Drag = { id: CardId; pointerId: number; dx: number; dy: number; x: number; y: number; w: number; h: number; target: Target };

/** Moves `id` into column `col` at `index` (counted among that column's other cards), keeping
 *  everything else in order. The overall order is the order cards stack on a phone. */
export function moveCard(cards: CardPref[], id: CardId, { col, index }: Target, single: boolean): CardPref[] {
  const card = cards.find((c) => c.id === id)!;
  const rest = cards.filter((c) => c.id !== id);
  const moved = { ...card, col: single ? card.col : col };
  const peers = single ? rest : rest.filter((c) => c.col === col);
  let at: number;
  if (index < peers.length) at = rest.indexOf(peers[index]);
  else if (peers.length) at = rest.indexOf(peers[peers.length - 1]) + 1;
  else at = rest.length;
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

export function useNarrow(query: string) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return narrow;
}

export const Grip = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {[6, 12, 18].flatMap((y) => [9, 15].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.6" />))}
  </svg>
);

export function useCardDrag({ cards, onChange, narrowQuery, autoScroll = false }: { cards: CardPref[]; onChange: (cards: CardPref[]) => void; narrowQuery: string; autoScroll?: boolean }) {
  const single = useNarrow(narrowQuery);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [said, setSaid] = useState("");
  const items = useRef(new Map<CardId, HTMLElement>());
  const lists = useRef<(HTMLElement | null)[]>([]);

  // While dragging, show the cards as they'd land, with a gap where the dragged one would go.
  const preview = drag ? moveCard(cards, drag.id, drag.target, single) : cards;
  const columns: CardPref[][] = single ? [preview] : [preview.filter((c) => c.col === 0), preview.filter((c) => c.col === 1)];

  const targetAt = (x: number, y: number, id: CardId): Target => {
    let col: 0 | 1 = 0;
    if (!single) {
      const r1 = lists.current[1]?.getBoundingClientRect();
      col = r1 && x >= r1.left - 8 ? 1 : 0;
    }
    const others = (single ? cards : cards.filter((c) => c.col === col)).filter((c) => c.id !== id);
    let index = 0;
    for (const c of others) {
      const r = items.current.get(c.id)?.getBoundingClientRect();
      if (r && y > r.top + r.height / 2) index++;
    }
    return { col, index };
  };
  const latest = useRef({ drag, targetAt, cards, single, onChange });
  latest.current = { drag, targetAt, cards, single, onChange };

  // Follow the pointer on the window: the dragged element is re-created as it changes column, so
  // pointer capture on it wouldn't last.
  const dragging = drag?.id;
  useEffect(() => {
    if (!dragging) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      const { drag: d, targetAt: at } = latest.current;
      if (!d || e.pointerId !== d.pointerId) return;
      setDrag({ ...d, x: e.clientX, y: e.clientY, target: at(e.clientX, e.clientY, d.id) });
    };
    const up = (e: PointerEvent) => {
      const { drag: d, targetAt: at, cards: list, single: one, onChange: done } = latest.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const next = moveCard(list, d.id, at(e.clientX, e.clientY, d.id), one);
      setDrag(null);
      if (next.some((c, i) => c.id !== list[i].id || c.col !== list[i].col)) done(next);
    };
    const cancel = () => setDrag(null);
    // Scroll while the pointer is held near the top or bottom edge.
    const scroll = () => {
      const d = latest.current.drag;
      if (d) {
        const edge = 90;
        const v = d.y < edge ? -(edge - d.y) / 4 : d.y > innerHeight - edge ? (d.y - (innerHeight - edge)) / 4 : 0;
        if (v) {
          window.scrollBy(0, v);
          setDrag((x) => (x ? { ...x, target: latest.current.targetAt(x.x, x.y, x.id) } : x));
        }
      }
      raf = requestAnimationFrame(scroll);
    };
    if (autoScroll) raf = requestAnimationFrame(scroll);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [dragging, autoScroll]);

  const begin = (c: CardPref, pointerId: number, downX: number, downY: number, x: number, y: number) => {
    const el = items.current.get(c.id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const peers = single ? cards : cards.filter((p) => p.col === c.col);
    setDrag({
      id: c.id, pointerId, dx: downX - r.left, dy: downY - r.top, x, y, w: r.width, h: r.height,
      target: { col: c.col, index: peers.findIndex((p) => p.id === c.id) },
    });
  };

  /** Start dragging card `c` right away (from a grip). */
  const start = (e: React.PointerEvent, c: CardPref) => {
    if (e.button !== 0) return;
    e.preventDefault();
    begin(c, e.pointerId, e.clientX, e.clientY, e.clientX, e.clientY);
  };

  /** Pick up card `c` from anywhere on it: with a mouse once it moves a few pixels (so clicks
   *  still work), with a finger after a short press-and-hold (so a swipe still scrolls). */
  const press = (e: React.PointerEvent, c: CardPref) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, a, input, select, [role=switch]")) return;
    const id = e.pointerId, x0 = e.clientX, y0 = e.clientY, touch = e.pointerType === "touch";
    let x = x0, y = y0, started = false;
    const timer = touch
      ? setTimeout(() => {
          started = true;
          navigator.vibrate?.(8);
          begin(c, id, x0, y0, x, y);
        }, 280)
      : undefined;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id || started) return;
      x = ev.clientX;
      y = ev.clientY;
      const far = Math.hypot(x - x0, y - y0);
      if (touch && far > 8) done(); // a swipe: let the page scroll
      if (!touch && far > 4) {
        started = true;
        begin(c, id, x0, y0, x, y);
      }
    };
    // Once a card is picked up by touch, stop the page from scrolling under the finger.
    const noScroll = (ev: TouchEvent) => started && ev.cancelable && ev.preventDefault();
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", done);
      window.removeEventListener("pointercancel", done);
      document.removeEventListener("touchmove", noScroll);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done);
    window.addEventListener("pointercancel", done);
    document.addEventListener("touchmove", noScroll, { passive: false });
  };

  const onKey = (e: React.KeyboardEvent, c: CardPref, focusSelector = ".grip") => {
    const peers = single ? cards : cards.filter((x) => x.col === c.col);
    const i = peers.findIndex((x) => x.id === c.id);
    let t: Target | null = null;
    if (e.key === "ArrowUp" && i > 0) t = { col: c.col, index: i - 1 };
    if (e.key === "ArrowDown" && i < peers.length - 1) t = { col: c.col, index: i + 1 };
    if (!single && e.key === "ArrowRight" && c.col === 0) t = { col: 1, index: Math.min(i, cards.filter((x) => x.col === 1).length) };
    if (!single && e.key === "ArrowLeft" && c.col === 1) t = { col: 0, index: Math.min(i, cards.filter((x) => x.col === 0).length) };
    if (!t) return;
    e.preventDefault();
    onChange(moveCard(cards, c.id, t, single));
    setSaid(`${CARD_NAMES[c.id]}: ${single ? "" : t.col ? "right column, " : "left column, "}position ${t.index + 1}`);
    requestAnimationFrame(() => items.current.get(c.id)?.querySelector<HTMLElement>(focusSelector)?.focus());
  };

  return {
    single,
    drag,
    dragged: drag ? cards.find((c) => c.id === drag.id) ?? null : null,
    columns,
    said,
    start,
    press,
    onKey,
    itemRef: (id: CardId) => (el: HTMLElement | null) => void (el ? items.current.set(id, el) : items.current.delete(id)),
    listRef: (col: number) => (el: HTMLElement | null) => void (lists.current[col] = el),
    help: single ? "Use the up and down arrow keys to move the card." : "Use the arrow keys: up and down to reorder, left and right to change column.",
  };
}
