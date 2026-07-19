import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Animates a number toward `value` whenever it changes. Used for stat tiles,
 * badges, DOOD totals and the breakdown summary — anywhere a count should feel
 * like it *arrives* rather than snapping. Renders in `tabular-nums` so the
 * width doesn't jitter mid-count.
 *
 * Respects `prefers-reduced-motion`: reduced-motion users see the final value
 * immediately, no tween.
 */
export function useCountUp(value: number, durationMs = 600): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number>();

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    const to = value;
    if (reduce || from === to) {
      fromRef.current = to;
      setDisplay(to);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic — quick then settles
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = value;
    };
  }, [value, durationMs]);

  return display;
}

interface CountUpProps {
  value: number;
  /** Decimal places to keep (default 0). */
  decimals?: number;
  durationMs?: number;
  prefix?: string;
  suffix?: string;
  /** Thousands separators via toLocaleString. */
  separator?: boolean;
  className?: string;
}

export function CountUp({
  value,
  decimals = 0,
  durationMs = 600,
  prefix,
  suffix,
  separator,
  className,
}: CountUpProps) {
  const n = useCountUp(value, durationMs);
  const rounded = decimals > 0 ? Number(n.toFixed(decimals)) : Math.round(n);
  const text = separator
    ? rounded.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : rounded.toFixed(decimals);
  return (
    <span className={cn("tabular-nums", className)}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}
