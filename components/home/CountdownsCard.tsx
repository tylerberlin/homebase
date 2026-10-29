"use client";

import { useEffect, useState } from "react";
import type { Countdown } from "@/lib/home/countdowns";
import { CloseIcon } from "../icons";

// Days until the things you're waiting for. Saved online so every device sees the same list.

const daysUntil = (date: string, now: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - new Date(now).setHours(0, 0, 0, 0)) / 86400000);
};
const nice = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
};

export default function CountdownsCard({ now, demo }: { now: number; demo: boolean }) {
  const [list, setList] = useState<Countdown[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo) {
      const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
      setList([
        { id: "a", title: "Hit 88 mph", date: inDays(88) },
        { id: "b", title: "Self-lacing shoes ship", date: inDays(9) },
        { id: "c", title: "Trip back to 1985", date: inDays(5) },
      ]);
      return;
    }
    fetch("/api/countdowns", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setEnabled(d.enabled);
        setList(d.countdowns);
      })
      .catch(() => setList([]));
  }, [demo]);

  const send = async (method: "POST" | "DELETE", body?: object, id?: string) => {
    setError(null);
    if (demo) return;
    const r = await fetch(`/api/countdowns${id ? `?id=${encodeURIComponent(id)}` : ""}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setError(d.error ?? `HTTP ${r.status}`);
    setList(d.countdowns);
    return true;
  };

  return (
    <section className="card home-card" id="countdowns">
      <div className="card-title-row">
        <h3>Countdowns</h3>
        {enabled && (
          <button type="button" className="chip" onClick={() => setAdding(!adding)} aria-expanded={adding}>
            {adding ? "Cancel" : "Add"}
          </button>
        )}
      </div>
      {adding && (
        <form
          className="cd-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await send("POST", { title, date })) {
              setTitle("");
              setDate("");
              setAdding(false);
            }
          }}
        >
          <input className="field" placeholder="What's happening?" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} required aria-label="Title" />
          <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} required aria-label="Date" />
          <button className="btn" type="submit">
            Add
          </button>
        </form>
      )}
      {error && <div className="cd-error">{error}</div>}
      {!enabled && <div className="cd-empty">Countdowns need the shared storage connected.</div>}
      {enabled && list?.length === 0 && !adding && <div className="cd-empty">Nothing yet. Add a trip, a birthday or a release date.</div>}
      <ul className="cds">
        {list?.map((c) => {
          const n = daysUntil(c.date, now);
          return (
            <li key={c.id} className={`cd ${n < 0 ? "past" : n <= 7 ? "soon" : ""}`}>
              <div className="cd-n mono">{n === 0 ? "Today" : Math.abs(n)}</div>
              <div className="cd-main">
                <div className="cd-title">{c.title}</div>
                <div className="cd-date">
                  {n === 0 ? nice(c.date) : `${n > 0 ? "days until" : "days since"} · ${nice(c.date)}`}
                </div>
              </div>
              {enabled && (
                <button type="button" className="cd-del" aria-label={`Remove ${c.title}`} onClick={() => send("DELETE", undefined, c.id)}>
                  <CloseIcon size={14} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
