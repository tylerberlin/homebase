import type { Quote } from "@/lib/home/markets";

// Watchlist with today's change and an intraday sparkline.

function Line({ values, up }: { values: number[]; up: boolean }) {
  const w = 72, h = 24, n = values.length;
  if (n < 2) return <svg className="mkt-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true" />;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const d = values.map((v, i) => `${i ? "L" : "M"}${((i / (n - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join("");
  return (
    <svg className={`mkt-spark ${up ? "up" : "down"}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const price = (q: Quote) =>
  q.price.toLocaleString(undefined, { minimumFractionDigits: q.index ? 0 : 2, maximumFractionDigits: q.index ? 0 : 2 });

export default function MarketsCard({ quotes }: { quotes: Quote[] }) {
  if (!quotes.length) return null;
  return (
    <section className="card home-card" id="markets">
      <h3>Stocks</h3>
      <ul className="mkts">
        {quotes.map((q) => {
          const up = q.change >= 0;
          return (
            <li key={q.symbol} className={`mkt ${q.index ? "mkt-index" : ""}`}>
              <span className="mkt-name">
                {q.name}
                {q.name !== q.symbol && <span className="mkt-sym mono">{q.symbol.replace(/^\^/, "")}</span>}
              </span>
              <Line values={q.line} up={up} />
              <span className="mkt-price mono">{price(q)}</span>
              <span className={`mkt-chg mono ${up ? "up" : "down"}`}>
                {up ? "+" : "−"}
                {Math.abs(q.changePct).toFixed(2)}%
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
