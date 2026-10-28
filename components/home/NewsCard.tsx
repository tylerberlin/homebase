"use client";

import { useState } from "react";
import type { Headline } from "@/lib/home/news";
import { ago } from "@/lib/useHome";

// Headlines from your feeds, filterable by category.

export default function NewsCard({ headlines, now }: { headlines: Headline[]; now: number }) {
  const categories = [...new Set(headlines.map((h) => h.category))];
  const [cat, setCat] = useState("All");
  const [more, setMore] = useState(false);
  if (!headlines.length) return null;
  const shown = headlines.filter((h) => cat === "All" || h.category === cat);
  const list = shown.slice(0, more ? 24 : 10);
  return (
    <section className="card home-card" id="news">
      <div className="card-title-row">
        <h3>News</h3>
        <div className="chips" role="group" aria-label="News category">
          {["All", ...categories].map((c) => (
            <button key={c} type="button" className={`chip ${c === cat ? "on" : ""}`} aria-pressed={c === cat} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <ul className="news">
        {list.map((h) => (
          <li key={h.url}>
            <a href={h.url} target="_blank" rel="noopener noreferrer" className="news-item">
              <span className="news-title">{h.title}</span>
              <span className="news-meta">
                {h.source}
                {h.date && ` · ${ago(h.date, now)}`}
              </span>
            </a>
          </li>
        ))}
      </ul>
      {shown.length > 10 && (
        <button type="button" className="more-btn" onClick={() => setMore(!more)}>
          {more ? "Show fewer" : "Show more"}
        </button>
      )}
    </section>
  );
}
