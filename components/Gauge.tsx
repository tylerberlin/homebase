"use client";

import { useId } from "react";
import type { Level } from "@/lib/format";
import { useAnimatedNumber } from "@/lib/useAnimatedNumber";

const R = 40;
const C = 2 * Math.PI * R;
const ARC = C * 0.75; // 270° sweep, open at the bottom

/** Glowing ring gauge. `value` is shown in the centre; the ring fills to value / max. */
export default function Gauge({
  label, value, max = 100, unit, sub, lvl = "",
}: { label: string; value: number | null | undefined; max?: number; unit: string; sub?: string; lvl?: Level }) {
  const gradId = "g" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const v = useAnimatedNumber(value);
  const frac = v == null ? 0 : Math.max(0, Math.min(1, v / max));
  const ring = { cx: 50, cy: 50, r: R, fill: "none", strokeWidth: 8, strokeLinecap: "round" as const, transform: "rotate(135 50 50)" };

  return (
    <div className={`gauge ${lvl}`}>
      <div
        className="gauge-dial"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value == null ? "unknown" : `${Math.round(value)}${unit}`}
      >
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <linearGradient id={gradId} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="var(--orb-2)" />
              <stop offset="1" stopColor="var(--accent)" />
            </linearGradient>
          </defs>
          <circle {...ring} className="gauge-track" strokeDasharray={`${ARC} ${C}`} />
          {frac > 0 && (
            <circle
              {...ring}
              className="gauge-fill"
              stroke={lvl ? `var(--${lvl})` : `url(#${gradId})`}
              strokeDasharray={`${ARC * frac} ${C}`}
            />
          )}
        </svg>
        <div className="gauge-val mono" aria-hidden="true">
          {v == null ? "–" : Math.round(v)}
          {v != null && <small>{unit}</small>}
        </div>
      </div>
      <div className="gauge-label">{label}</div>
      {sub && <div className="gauge-sub mono">{sub}</div>}
    </div>
  );
}
