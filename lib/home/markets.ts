import { cached, getJson } from "./cache";

// Prices for the watchlist from Yahoo Finance's chart endpoint (no key), with today's intraday
// line for a sparkline.

const NAMES: Record<string, string> = { "^GSPC": "S&P 500", "^IXIC": "Nasdaq", "^DJI": "Dow Jones", "^RUT": "Russell 2000", GOOGL: "Google", GOOG: "Google", AMZN: "Amazon", META: "Meta", "BRK-B": "Berkshire Hathaway" };

/** "Apple Inc." → "Apple", "NVIDIA Corporation" → "Nvidia", "The Coca-Cola Company" → "Coca-Cola". */
export function shortName(raw: string | undefined, symbol: string) {
  if (NAMES[symbol]) return NAMES[symbol];
  const n = (raw ?? "")
    .trim()
    .replace(/,?\s+(Inc\.?|Incorporated|Corporation|Corp\.?|Company|Co\.?|Ltd\.?|Limited|plc|PLC|N\.V\.|S\.A\.|Holdings?|Group|Platforms|\(The\))$/i, "")
    .replace(/,?\s+(Inc\.?|Corporation|Corp\.?|Class [A-C])$/i, "")
    .replace(/\s*&$/, "") // "JPMorgan Chase & Co." → "JPMorgan Chase"
    .replace(/^The\s+/i, "")
    .replace(/\s+USD$/, "") // crypto: "Bitcoin USD" → "Bitcoin"
    .trim();
  if (!n) return symbol;
  return n === n.toUpperCase() && n.length > 4 ? n[0] + n.slice(1).toLowerCase() : n;
}

export type Quote = { symbol: string; name: string; price: number; change: number; changePct: number; currency?: string; line: number[]; index: boolean };

export async function quote(symbol: string): Promise<Quote & { fullName?: string }> {
  const d = await getJson<{ chart: { result: { meta: { regularMarketPrice: number; chartPreviousClose: number; previousClose?: number; shortName?: string; longName?: string; currency?: string }; indicators: { quote: { close: (number | null)[] }[] } }[] } }>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=15m`,
  );
  const r = d.chart.result[0];
  const prev = r.meta.chartPreviousClose ?? r.meta.previousClose;
  const price = r.meta.regularMarketPrice;
  return {
    symbol,
    name: shortName(r.meta.shortName ?? r.meta.longName, symbol),
    price,
    change: price - prev,
    changePct: prev ? ((price - prev) / prev) * 100 : 0,
    currency: r.meta.currency,
    line: (r.indicators.quote[0]?.close ?? []).filter((x): x is number => x != null),
    index: symbol.startsWith("^"),
    fullName: r.meta.longName ?? r.meta.shortName,
  };
}

export async function markets(tickers: string[]): Promise<Quote[]> {
  const quotes = await Promise.all(tickers.map((s) => cached(`quote:${s}`, 2 * 60 * 1000, () => quote(s))));
  return quotes.filter((q): q is Quote => !!q);
}
