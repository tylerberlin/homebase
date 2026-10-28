"use client";

import { useEffect, useRef, useState } from "react";

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Eases from the previous value to `target` (counting up from 0 on first show). */
export function useAnimatedNumber(target: number | null | undefined, ms = 800): number | null {
  const [value, setValue] = useState<number | null>(target == null ? null : 0);
  const current = useRef(0);

  useEffect(() => {
    if (target == null) {
      setValue(null);
      return;
    }
    const from = current.current;
    if (from === target || reducedMotion()) {
      current.current = target;
      setValue(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      current.current = from + (target - from) * (1 - (1 - p) ** 3);
      setValue(current.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // Frames don't run in background tabs; make sure we still land on the real value.
    const settle = setTimeout(() => {
      cancelAnimationFrame(raf);
      current.current = target;
      setValue(target);
    }, ms + 100);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
    };
  }, [target, ms]);

  return value;
}

export function AnimatedNumber({ value, decimals = 0 }: { value: number | null | undefined; decimals?: number }) {
  const v = useAnimatedNumber(value);
  return <>{v == null ? "–" : v.toFixed(decimals)}</>;
}
