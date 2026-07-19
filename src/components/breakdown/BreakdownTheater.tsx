import React, { useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Sparkles, Check, Loader2, Clock } from "lucide-react";
import type { Scene, BreakdownElement, ElementCategory } from "@/types";
import type { BreakdownProgress } from "@/lib/script";
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/breakdownVisuals";
import { CountUp } from "@/components/ui/CountUp";
import { chipVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface TheaterResult {
  elements: BreakdownElement[];
  fallback: boolean;
}

interface BreakdownTheaterProps {
  scenes: Scene[];
  results: Record<string, TheaterResult>;
  progress: BreakdownProgress | null;
}

// Up to BATCH_SIZE(10) × CONCURRENCY(3) scenes are in flight at once.
const ANALYZING_WINDOW = 30;

/**
 * The live progress "theater" shown while a full breakdown runs. Scene tiles
 * flip queued → analyzing → done, real extracted elements land as colored
 * chips, and running counters climb — so the wait reads as the product working,
 * not a spinner. Purely presentational; it renders whatever the run has
 * reported so far.
 */
export function BreakdownTheater({ scenes, results, progress }: BreakdownTheaterProps) {
  const reduce = useReducedMotion();
  const doneCount = Object.keys(results).length;
  const total = scenes.length;
  const chars = progress?.stage === "characters";

  // Category tallies across everything found so far.
  const tally = useMemo(() => {
    const t: Partial<Record<ElementCategory, number>> = {};
    let all = 0;
    for (const r of Object.values(results)) {
      for (const el of r.elements) {
        t[el.category] = (t[el.category] ?? 0) + 1;
        all += 1;
      }
    }
    return { t, all };
  }, [results]);

  const topCategories = CATEGORY_ORDER.filter((c) => (tally.t[c] ?? 0) > 0).slice(0, 6);

  return (
    <div className="py-2">
      {/* Header — running counters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative">
          <motion.span
            className="flex w-10 h-10 rounded-xl items-center justify-center shrink-0"
            style={{ background: "rgba(139,92,246,0.14)" }}
            animate={reduce ? undefined : { scale: [1, 1.06, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          >
            <Sparkles size={18} className="text-[var(--color-ai)]" />
          </motion.span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[var(--text-primary)]">
            {chars
              ? "Reading the whole script for characters & locations"
              : "Breaking down every scene"}
          </div>
          <div className="text-xs text-[var(--text-secondary)] tabular-nums">
            {chars ? (
              <span>Two passes for consistent cast & location naming…</span>
            ) : (
              <>
                Scene <CountUp value={doneCount} durationMs={400} />/{total}
                {tally.all > 0 && (
                  <>
                    {" · "}
                    <CountUp value={tally.all} durationMs={400} /> element
                    {tally.all === 1 ? "" : "s"} so far
                  </>
                )}
              </>
            )}
          </div>
        </div>
        {progress?.waitingSeconds ? (
          <span className="flex items-center gap-1.5 text-xs text-[var(--color-warning)] shrink-0">
            <Clock size={13} /> waiting {progress.waitingSeconds}s
          </span>
        ) : (
          <Loader2 size={16} className="animate-spin text-[var(--color-ai)] shrink-0" />
        )}
      </div>

      {/* Category tally chips */}
      <AnimatePresence>
        {topCategories.length > 0 && (
          <motion.div
            className="flex flex-wrap gap-1.5 mb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {topCategories.map((cat) => (
              <motion.span
                key={cat}
                layout={!reduce}
                className="inline-flex items-center gap-1.5 h-6 px-2 rounded-badge text-[11px] font-medium"
                style={{
                  background: `color-mix(in srgb, ${CATEGORY_META[cat].color} 12%, transparent)`,
                  color: CATEGORY_META[cat].color,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: CATEGORY_META[cat].color }}
                />
                <CountUp value={tally.t[cat] ?? 0} durationMs={350} /> {CATEGORY_META[cat].label}
              </motion.span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scene grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2 max-h-[46vh] overflow-y-auto pr-1">
        {scenes.map((scene, i) => {
          const res = results[scene.id];
          const state: "done" | "analyzing" | "queued" = res
            ? "done"
            : !chars && i < doneCount + ANALYZING_WINDOW
              ? "analyzing"
              : "queued";
          return <SceneTile key={scene.id} scene={scene} state={state} result={res} reduce={!!reduce} />;
        })}
      </div>
    </div>
  );
}

function SceneTile({
  scene,
  state,
  result,
  reduce,
}: {
  scene: Scene;
  state: "done" | "analyzing" | "queued";
  result?: TheaterResult;
  reduce: boolean;
}) {
  const analyzing = state === "analyzing";
  const done = state === "done";

  // Distinct element categories present, for the little dot row.
  const cats = useMemo(() => {
    if (!result) return [] as ElementCategory[];
    const seen = new Set<ElementCategory>();
    for (const el of result.elements) seen.add(el.category);
    return CATEGORY_ORDER.filter((c) => seen.has(c));
  }, [result]);

  return (
    <motion.div
      layout={!reduce}
      className={cn(
        "relative rounded-lg border p-2 overflow-hidden transition-colors",
        done
          ? "border-[color-mix(in_srgb,var(--color-success)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-success)_6%,transparent)]"
          : analyzing
            ? "border-[color-mix(in_srgb,var(--color-ai)_45%,transparent)]"
            : "border-[var(--border-default)] opacity-55"
      )}
    >
      {/* analyzing shimmer sweep */}
      {analyzing && !reduce && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(100deg, transparent 30%, rgba(139,92,246,0.14) 50%, transparent 70%)",
          }}
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 1.3, repeat: Infinity, ease: "linear" }}
        />
      )}

      <div className="flex items-center justify-between gap-1 relative">
        <span className="font-mono text-[11px] text-[var(--text-secondary)] truncate">
          {scene.number}
        </span>
        {done ? (
          <motion.span
            initial={reduce ? undefined : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
          >
            <Check size={13} className="text-[var(--color-success)]" />
          </motion.span>
        ) : analyzing ? (
          <Loader2 size={12} className="animate-spin text-[var(--color-ai)]" />
        ) : (
          <span className="w-2 h-2 rounded-full bg-[var(--text-muted)] opacity-40" />
        )}
      </div>

      <div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5 relative">
        {scene.location || "—"}
      </div>

      {/* element category dots animate in on completion */}
      <div className="flex items-center gap-1 mt-1.5 min-h-[10px] relative flex-wrap">
        <AnimatePresence>
          {done &&
            cats.slice(0, 8).map((cat) => (
              <motion.span
                key={cat}
                variants={reduce ? undefined : chipVariants}
                initial="initial"
                animate="animate"
                className="w-2 h-2 rounded-full"
                style={{ background: CATEGORY_META[cat].color }}
                title={CATEGORY_META[cat].label}
              />
            ))}
        </AnimatePresence>
        {done && result && result.elements.length > 0 && (
          <span className="text-[9px] text-[var(--text-muted)] tabular-nums ml-0.5">
            {result.elements.length}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ------------------------------------------------------------
// Springy summary card — the finale.
// ------------------------------------------------------------
export interface TheaterSummaryProps {
  sceneCount: number;
  elementCount: number;
  characterCount: number;
  locationCount: number;
  seconds: number;
}

export function TheaterSummary({
  sceneCount,
  elementCount,
  characterCount,
  locationCount,
  seconds,
}: TheaterSummaryProps) {
  const reduce = useReducedMotion();
  const stats: { label: string; value: number; suffix?: string }[] = [
    { label: "Elements", value: elementCount },
    { label: "Scenes", value: sceneCount },
    { label: "Characters", value: characterCount },
    { label: "Locations", value: locationCount },
  ];

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 22 }}
      className="relative overflow-hidden rounded-card border border-[rgba(139,92,246,0.3)] p-5"
      style={{ background: "rgba(139,92,246,0.06)" }}
    >
      {/* one shimmer sweep */}
      {!reduce && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(100deg, transparent 35%, rgba(255,255,255,0.12) 50%, transparent 65%)",
          }}
          initial={{ x: "-120%" }}
          animate={{ x: "120%" }}
          transition={{ duration: 1.1, ease: "easeInOut", delay: 0.25 }}
        />
      )}

      <div className="flex items-center gap-2 mb-4 relative">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "rgba(34,197,94,0.14)" }}
        >
          <Check size={18} className="text-[var(--color-success)]" />
        </div>
        <div>
          <div className="text-base font-semibold text-[var(--text-primary)]">Breakdown complete</div>
          <div className="text-xs text-[var(--text-secondary)] tabular-nums">
            Finished in <CountUp value={seconds} decimals={0} suffix="s" durationMs={800} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 relative">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="text-2xl font-semibold text-[var(--text-primary)]">
              <CountUp value={s.value} durationMs={900} separator />
            </div>
            <div className="section-header mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
