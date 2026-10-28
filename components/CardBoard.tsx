"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { CARD_NAMES, type CardPref } from "@/lib/settings";
import { Grip, useCardDrag } from "@/lib/useCardDrag";

// Settings → Home cards: a small version of the Home layout to drag cards around in (two columns
// on wide screens, one list on a phone). The Home tab's own edit mode works the same way.

export default function CardBoard({
  cards, onChange, renderControls,
}: {
  cards: CardPref[];
  onChange: (cards: CardPref[]) => void;
  renderControls: (c: CardPref, single: boolean) => React.ReactNode;
}) {
  const d = useCardDrag({ cards, onChange, narrowQuery: "(max-width: 640px)" });
  const board = useRef<HTMLDivElement>(null);

  const row = (c: CardPref, ghost = false) => (
    <>
      <button
        type="button"
        className="grip"
        aria-label={`Move ${CARD_NAMES[c.id]}`}
        aria-describedby="board-help"
        tabIndex={ghost ? -1 : 0}
        onPointerDown={(e) => d.start(e, c)}
        onKeyDown={(e) => d.onKey(e, c)}
      >
        <Grip />
      </button>
      <span className="set-item-name">{CARD_NAMES[c.id]}</span>
      {renderControls(c, d.single)}
    </>
  );

  return (
    <div ref={board} className={`board ${d.single ? "single" : ""} ${d.drag ? "dragging" : ""}`}>
      {d.columns.map((list, col) => (
        <div key={col} className="board-col">
          {!d.single && <div className="board-col-name">{col ? "Right column" : "Left column"}</div>}
          <ol className="set-list board-list" ref={d.listRef(col)}>
            {list.map((c) => (
              <li
                key={c.id}
                ref={d.itemRef(c.id)}
                className={`set-item ${c.on ? "" : "off"} ${d.drag?.id === c.id ? "placeholder" : ""}`}
                style={d.drag?.id === c.id ? { height: d.drag.h } : undefined}
              >
                {d.drag?.id === c.id ? null : row(c)}
              </li>
            ))}
            {!d.single && !list.length && <li className="board-empty">Drop a card here</li>}
          </ol>
        </div>
      ))}
      {/* The card under your finger. Rendered on the dialog itself: the glass panel's backdrop
          filter would make position: fixed relative to the panel instead of the screen. */}
      {d.drag &&
        d.dragged &&
        createPortal(
          <div
            className={`set-item board-float ${d.dragged.on ? "" : "off"}`}
            style={{ width: d.drag.w, height: d.drag.h, transform: `translate(${d.drag.x - d.drag.dx}px, ${d.drag.y - d.drag.dy}px)` }}
            aria-hidden="true"
          >
            {row(d.dragged, true)}
          </div>,
          board.current?.closest("dialog") ?? document.body,
        )}
      <p id="board-help" className="sr-only">{d.help}</p>
      <p className="sr-only" aria-live="polite">{d.said}</p>
    </div>
  );
}
