import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X, ArrowRight, ArrowLeft, Check } from "lucide-react";
import { useStore } from "@/state/store";
import { TOUR_STEPS } from "@/data/tour";
import { Button } from "@/components/ui/Button";
import { SPRING } from "@/lib/motion";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Custom spotlight tour over the real UI (no heavy lib). It navigates to each
 * step's page, finds the live element by its `data-tour` key, cuts a spotlight
 * hole around it, and anchors a step card beside it. Progress is persisted in
 * the store, so closing and reopening resumes where you were.
 */
export function TourOverlay() {
  const nav = useNavigate();
  const loc = useLocation();
  const reduce = useReducedMotion();

  const running = useStore((s) => s.tour.running);
  const stepIndex = useStore((s) => s.tour.stepIndex);
  const setTourStep = useStore((s) => s.setTourStep);
  const stopTour = useStore((s) => s.stopTour);
  const completeTourStep = useStore((s) => s.completeTourStep);

  const step = TOUR_STEPS[Math.min(stepIndex, TOUR_STEPS.length - 1)];
  const [rect, setRect] = useState<Rect | null>(null);
  const rafRef = useRef<number>();

  // Land on the step's page.
  useEffect(() => {
    if (running && step && loc.pathname !== step.route) {
      nav(step.route);
    }
  }, [running, step, loc.pathname, nav]);

  // Locate the spotlight target once we're on the right page. Polls briefly so
  // a freshly navigated page has time to mount its elements.
  useLayoutEffect(() => {
    if (!running || !step) return;
    let tries = 0;
    let cancelled = false;

    const locate = () => {
      if (cancelled) return;
      if (!step.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        const pad = step.pad ?? 8;
        setRect({
          top: r.top - pad,
          left: r.left - pad,
          width: r.width + pad * 2,
          height: r.height + pad * 2,
        });
        return;
      }
      if (tries++ < 40) rafRef.current = requestAnimationFrame(locate);
      else setRect(null); // give up → centered card
    };
    locate();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, step, loc.pathname]);

  // Keep the spotlight glued to the element on scroll/resize.
  useEffect(() => {
    if (!running || !step?.target) return;
    const update = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const pad = step.pad ?? 8;
      setRect({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
    };
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [running, step]);

  if (!running || !step) return null;

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  const finish = () => {
    completeTourStep(step.id);
    stopTour();
  };
  const next = () => {
    completeTourStep(step.id);
    if (isLast) stopTour();
    else setTourStep(stepIndex + 1);
  };
  const back = () => setTourStep(Math.max(0, stepIndex - 1));

  // Card placement: near the spotlight when we have one, else centered.
  const cardStyle: React.CSSProperties = rect
    ? placeCard(rect)
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div className="fixed inset-0 z-[95]" role="dialog" aria-label="Guided tour">
      {/* Dimming + spotlight hole via a huge box-shadow around the rect. */}
      <AnimatePresence>
        {rect ? (
          <motion.div
            key="spot"
            className="absolute rounded-xl pointer-events-none"
            style={{
              boxShadow: "0 0 0 9999px var(--overlay), 0 0 0 2px var(--accent-blue) inset",
            }}
            initial={reduce ? { opacity: 0 } : false}
            animate={{ opacity: 1, top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
            transition={reduce ? { duration: 0 } : SPRING}
          />
        ) : (
          <motion.div
            key="dim"
            className="absolute inset-0"
            style={{ background: "var(--overlay)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>

      {/* Step card */}
      <motion.div
        key={step.id}
        className="absolute w-[340px] max-w-[92vw] rounded-card border border-[var(--border-default)] shadow-2xl p-4"
        style={{ ...cardStyle, background: "var(--bg-elevated)" }}
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-blue)]">
            Step {stepIndex + 1} of {TOUR_STEPS.length}
          </div>
          <button
            onClick={finish}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            aria-label="End tour"
          >
            <X size={15} />
          </button>
        </div>
        <div className="text-base font-semibold text-[var(--text-primary)]">{step.title}</div>
        <p className="text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed">{step.body}</p>

        {/* progress dots */}
        <div className="flex items-center gap-1 mt-3">
          {TOUR_STEPS.map((s, i) => (
            <span
              key={s.id}
              className="h-1 rounded-full transition-all"
              style={{
                width: i === stepIndex ? 18 : 6,
                background: i <= stepIndex ? "var(--accent-blue)" : "var(--border-hover)",
              }}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 mt-4">
          {!isFirst && (
            <Button variant="ghost" size="sm" onClick={back}>
              <ArrowLeft size={13} /> Back
            </Button>
          )}
          {step.tryRoute && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                completeTourStep(step.id);
                nav(step.tryRoute!);
              }}
            >
              {step.tryLabel ?? "Try it"}
            </Button>
          )}
          <Button size="sm" className="ml-auto" onClick={next}>
            {isLast ? (
              <>
                <Check size={13} /> Done
              </>
            ) : (
              <>
                Next <ArrowRight size={13} />
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

/** Place the card near the spotlight without running off-screen. */
function placeCard(rect: Rect): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = 340;
  const cardH = 220;
  const gap = 14;

  // Prefer right, then below, then left, then above.
  if (rect.left + rect.width + gap + cardW < vw) {
    return { top: clamp(rect.top, 8, vh - cardH - 8), left: rect.left + rect.width + gap };
  }
  if (rect.top + rect.height + gap + cardH < vh) {
    return { top: rect.top + rect.height + gap, left: clamp(rect.left, 8, vw - cardW - 8) };
  }
  if (rect.left - gap - cardW > 0) {
    return { top: clamp(rect.top, 8, vh - cardH - 8), left: rect.left - gap - cardW };
  }
  return { top: clamp(rect.top - gap - cardH, 8, vh - cardH - 8), left: clamp(rect.left, 8, vw - cardW - 8) };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
