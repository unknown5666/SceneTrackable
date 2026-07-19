import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, ArrowRight } from "lucide-react";
import { useStore, activeAIJob } from "@/state/store";

/** SVG progress ring, 0..1. Violet while running, green on complete. */
function ProgressRing({ value, color, size = 18 }: { value: number; color: string; size?: number }) {
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} opacity={0.2} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        initial={false}
        animate={{ strokeDashoffset: c * (1 - v) }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
    </svg>
  );
}

/**
 * Global pill for the running AI job. A progress ring is fed by `job.progress`
 * with a soft breathing glow; on completion it morphs to a green check, holds,
 * then slides out. Clicking opens a small detail popover.
 */
export function AIStatusPill() {
  const nav = useNavigate();
  const active = useStore(activeAIJob);
  const reduce = useReducedMotion();

  const [justDone, setJustDone] = useState(false);
  const [popOpen, setPopOpen] = useState(false);
  const last = useRef<{ label: string; route?: string } | null>(null);
  const prevActive = useRef(active);

  useEffect(() => {
    // Job ended (was present, now gone) and wasn't paused → celebrate briefly.
    if (prevActive.current && !active && prevActive.current.job.status === "running") {
      last.current = {
        label: prevActive.current.job.label,
        route: prevActive.current.job.route,
      };
      setJustDone(true);
      const t = setTimeout(() => setJustDone(false), 2000);
      prevActive.current = active;
      return () => clearTimeout(t);
    }
    prevActive.current = active;
  }, [active]);

  if (!active && !justDone) return null;

  const job = active?.job;
  const paused = job?.status === "paused_limit";
  const done = job?.progress.done ?? 0;
  const total = job?.progress.total ?? 0;
  const value = total > 0 ? done / total : 0;
  const label = job?.label ?? last.current?.label ?? "AI run";
  const route = job?.route ?? last.current?.route;
  const complete = justDone && !active;

  const tone = paused ? "var(--color-warning)" : complete ? "var(--color-success)" : "var(--color-ai)";

  return (
    <div className="relative hidden sm:block">
      <motion.button
        layout
        onClick={() => setPopOpen((v) => !v)}
        title={paused ? job?.error : `${label} — ${done}/${total}`}
        className="flex items-center gap-1.5 h-8 px-2.5 rounded-full border text-xs max-w-[240px] transition-colors"
        style={{
          borderColor: paused
            ? "var(--color-warning)"
            : complete
              ? "color-mix(in srgb, var(--color-success) 45%, transparent)"
              : "rgba(139,92,246,0.4)",
          background: paused
            ? "rgba(245,158,11,0.10)"
            : complete
              ? "rgba(34,197,94,0.10)"
              : "rgba(139,92,246,0.12)",
          color: tone,
        }}
        animate={
          reduce || paused || complete
            ? undefined
            : { boxShadow: ["0 0 0 0 rgba(139,92,246,0)", "0 0 12px 1px rgba(139,92,246,0.35)", "0 0 0 0 rgba(139,92,246,0)"] }
        }
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        {paused ? (
          <AlertTriangle size={13} className="shrink-0" />
        ) : complete ? (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
            <Check size={14} className="shrink-0" />
          </motion.span>
        ) : (
          <ProgressRing value={value} color={tone} />
        )}
        <span className="truncate font-medium">{label}</span>
        <span className="tabular-nums opacity-80 shrink-0">
          {paused ? "paused" : complete ? "done" : total > 0 ? `${done}/${total}` : ""}
        </span>
      </motion.button>

      <AnimatePresence>
        {popOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPopOpen(false)} />
            <motion.div
              className="absolute right-0 top-full mt-2 w-64 rounded-card border border-[var(--border-default)] z-50 p-3.5"
              style={{ background: "var(--bg-elevated)" }}
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -4 }}
              transition={{ duration: 0.15 }}
            >
              <div className="flex items-center gap-2.5">
                {!paused && !complete && <ProgressRing value={value} color={tone} size={26} />}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--text-primary)] truncate">{label}</div>
                  <div className="text-xs text-[var(--text-secondary)] tabular-nums">
                    {paused
                      ? "Paused — provider allowance reached"
                      : complete
                        ? "Completed"
                        : total > 0
                          ? `${done} of ${total} · ${Math.round(value * 100)}%`
                          : "Starting…"}
                  </div>
                </div>
              </div>
              {paused && job?.error && (
                <div className="mt-2 text-[11px] text-[var(--color-warning)]">{job.error}</div>
              )}
              {route && (
                <button
                  onClick={() => {
                    nav(route);
                    setPopOpen(false);
                  }}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 h-8 rounded-md text-xs bg-[var(--bg-surface-hover)] text-[var(--text-primary)] hover:bg-[var(--active-tint)] transition-colors"
                >
                  Go to run <ArrowRight size={12} />
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
