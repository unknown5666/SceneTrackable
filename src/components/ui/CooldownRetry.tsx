import React, { useEffect, useRef, useState } from "react";
import { RefreshCw, Clock, AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import type { AICooldown } from "@/lib/script";

/** A live cooldown: the limit kind plus the absolute epoch-ms to retry at. */
export interface ActiveCooldown {
  kind: AICooldown["kind"];
  until: number;
}

/**
 * A retry control for an AI action that failed on a provider limit. When
 * `cooldown` is set it counts down to when a retry is worth attempting and —
 * if armed — fires `onRetry` automatically the moment it elapses. Shared by
 * the schedule draft and any other one-shot AI call that can be rate-limited.
 */
export function CooldownRetry({
  cooldown,
  onRetry,
  busy,
  label = "Retry",
}: {
  cooldown: ActiveCooldown | null;
  onRetry: () => void;
  busy: boolean;
  label?: string;
}) {
  const [auto, setAuto] = useState(true);
  const [remaining, setRemaining] = useState(0);
  // Latest onRetry without retriggering the interval each render.
  const retryRef = useRef(onRetry);
  retryRef.current = onRetry;

  const until = cooldown ? cooldown.until : 0;

  useEffect(() => {
    if (!until) {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.round((until - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0 && auto && !busy) retryRef.current();
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [until, auto, busy]);

  const cooling = remaining > 0;
  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div className="rounded-card border border-[var(--border-default)] bg-[var(--bg-surface)] p-3.5 space-y-3 text-left">
      {cooldown && (
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={16} className="text-[var(--color-warning)] shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--text-secondary)]">
            {cooldown.kind === "allowance"
              ? "The AI provider's allowance is used up. You can try again later."
              : "The provider was rate-limited. A short wait usually clears it."}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="ai" onClick={onRetry} disabled={busy} loading={busy}>
          {!busy && <RefreshCw size={13} />}
          {cooling ? "Retry now" : label}
        </Button>
        {cooling && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-warning)] tabular-nums">
            <Clock size={13} /> auto-retry in {mm}:{ss}
          </span>
        )}
        {cooldown && (
          <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer ml-auto">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
              className="accent-[var(--color-ai)]"
            />
            Auto-retry when ready
          </label>
        )}
      </div>
    </div>
  );
}
