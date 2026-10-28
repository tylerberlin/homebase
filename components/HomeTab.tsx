"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { CalendarData } from "@/lib/calendar";
import { usePrefs } from "@/lib/prefs";
import { CARD_NAMES, type CardId, type CardPref } from "@/lib/settings";
import type { Status } from "@/lib/types";
import { Grip, useCardDrag } from "@/lib/useCardDrag";
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

// The Home tab's cards, in the order, columns and on/off choices from Settings. On phones it's one
// column in the same order. "Edit layout" lets you drag the cards around right here (same rules as
// Settings → Home cards): grab a card anywhere, or press and hold on a phone. Hidden cards show as
// slim tiles you can switch back on.

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
  const d = useCardDrag({ cards: s.cards, onChange: (cards) => update((x) => ({ ...x, cards })), narrowQuery: "(max-width: 820px)", autoScroll: true });
  const doneRef = useRef<HTMLButtonElement>(null);

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

  if (editing) {
    const toggle = (c: CardPref, on: boolean) => update((x) => ({ ...x, cards: x.cards.map((y) => (y.id === c.id ? { ...y, on } : y)) }));
    // Grip + on/off switch, in a small pill on the card's top edge (the card keeps its own heading).
    const controls = (c: CardPref) => (
      <div className="edit-ctrl">
        <button
          type="button"
          className="grip"
          aria-label={`Move ${CARD_NAMES[c.id]}`}
          aria-describedby="edit-help"
          onPointerDown={(e) => d.start(e, c)}
          onKeyDown={(e) => d.onKey(e, c)}
        >
          <Grip size={16} />
        </button>
        <Switch on={c.on} onChange={(on) => toggle(c, on)} label={`Show ${CARD_NAMES[c.id]}`} />
      </div>
    );
    return (
      <>
        <div className="edit-bar card" role="region" aria-label="Edit layout">
          <span className="edit-bar-text">
            <strong>Edit layout</strong>
            <span>
              {d.single ? "Press and hold a card, then drag it." : "Drag a card to move it, across columns too."} Switch one off to hide it.
            </span>
          </span>
          <span className={`settings-status edit-status`} aria-live="polite">
            {demo ? "Demo: not saved" : ""}
          </span>
          <button ref={doneRef} type="button" className="btn" onClick={onEditDone}>
            Done
          </button>
        </div>
        <div className={`grid home-grid editing ${d.single ? "single" : ""} ${d.drag ? "dragging" : ""}`}>
          {d.columns.map((list, col) => (
            <div key={col} className="col" ref={d.listRef(col)}>
              {list.map((c) => {
                const held = d.drag?.id === c.id;
                return (
                  <div
                    key={c.id}
                    ref={d.itemRef(c.id)}
                    className={`edit-tile ${c.on ? "" : "off"} ${held ? "placeholder" : ""}`}
                    style={held ? { height: d.drag!.h } : undefined}
                    onPointerDown={held ? undefined : (e) => d.press(e, c)}
                  >
                    {!held && (
                      <>
                        {controls(c)}
                        {c.on ? (
                          // Empty when the card has nothing to show yet; CSS then shows its name.
                          <div className="edit-body" inert data-name={CARD_NAMES[c.id]}>
                            {card(c.id)}
                          </div>
                        ) : (
                          <div className="edit-off">
                            {CARD_NAMES[c.id]} <span className="edit-hidden">Hidden</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
              {!d.single && !list.length && <div className="board-empty edit-empty">Drop a card here</div>}
            </div>
          ))}
        </div>
        {d.drag &&
          d.dragged &&
          createPortal(
            <div
              className="edit-float"
              style={{ transform: `translate(${d.drag.x - 24}px, ${d.drag.y - 22}px)` }}
              aria-hidden="true"
            >
              <Grip size={16} /> {CARD_NAMES[d.dragged.id]}
            </div>,
            document.body,
          )}
        <p id="edit-help" className="sr-only">{d.help}</p>
        <p className="sr-only" aria-live="polite">{d.said}</p>
      </>
    );
  }

  const shown = s.cards.filter((c) => c.on);
  const column = (col: 0 | 1) =>
    shown.map((c, order) =>
      c.col === col ? (
        <div key={c.id} className="home-slot" style={{ order }}>
          {card(c.id)}
        </div>
      ) : null,
    );

  return (
    <>
      {s.serverSummary && <ServerSummary data={status} />}
      {shown.length > 0 ? (
        <div className={`grid home-grid ${shown.every((c) => c.col === shown[0].col) ? "one-col" : ""}`}>
          <div className="col">{column(0)}</div>
          <div className="col">{column(1)}</div>
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
