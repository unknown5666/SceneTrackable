// ============================================================
// APPEARANCE — per-user accent color + density.
//
// Theme (dark/light/system) lives in state/theme.tsx. This handles the other
// two personal appearance knobs, applied as CSS custom properties / a root
// attribute so the whole token system picks them up. Persisted to localStorage
// and applied once at startup (see main.tsx) plus whenever Settings changes.
// ============================================================

export type Density = "comfortable" | "compact";
export type BackgroundMode = "solid" | "gradient";

export interface Appearance {
  accent: string;
  density: Density;
  /** Solid `--bg-base`, or an opt-in tinted gradient wash behind everything. */
  background: BackgroundMode;
  /** The gradient's tint (paired with the accent for a two-hue drift). */
  bgColor: string;
  /** Slowly shift the gradient. Auto-disabled under prefers-reduced-motion. */
  bgAnimate: boolean;
}

export const ACCENTS: { name: string; value: string }[] = [
  { name: "Blue", value: "#4F7BF7" },
  { name: "Violet", value: "#8B5CF6" },
  { name: "Emerald", value: "#22C55E" },
  { name: "Amber", value: "#F59E0B" },
  { name: "Rose", value: "#F43F5E" },
  { name: "Cyan", value: "#06B6D4" },
];

/** Curated gradient tints (the accent palette also drives the picker). */
export const BG_COLORS: { name: string; value: string }[] = [
  { name: "Violet", value: "#8B5CF6" },
  { name: "Blue", value: "#4F7BF7" },
  { name: "Teal", value: "#06B6D4" },
  { name: "Emerald", value: "#22C55E" },
  { name: "Sunset", value: "#F97316" },
  { name: "Rose", value: "#F43F5E" },
];

const KEY = "st-appearance";
const DEFAULT: Appearance = {
  accent: "#4F7BF7",
  density: "comfortable",
  background: "solid",
  bgColor: "#8B5CF6",
  bgAnimate: true,
};

export function readAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        accent: typeof parsed.accent === "string" ? parsed.accent : DEFAULT.accent,
        density: parsed.density === "compact" ? "compact" : "comfortable",
        background: parsed.background === "gradient" ? "gradient" : "solid",
        bgColor: typeof parsed.bgColor === "string" ? parsed.bgColor : DEFAULT.bgColor,
        bgAnimate: parsed.bgAnimate !== false,
      };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT };
}

export function applyAppearance(a: Appearance): void {
  const root = document.documentElement;
  root.style.setProperty("--accent-blue", a.accent);
  // Keep the active tint in step with the accent.
  root.style.setProperty("--active-tint", `color-mix(in srgb, ${a.accent} 12%, transparent)`);
  root.setAttribute("data-density", a.density);
  // Ambient gradient background — CSS in index.css keys off these.
  root.setAttribute("data-bg", a.background);
  root.setAttribute("data-bg-animate", a.bgAnimate ? "on" : "off");
  root.style.setProperty("--bg-grad-color", a.bgColor);
}

export function saveAppearance(a: Appearance): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* ignore */
  }
  applyAppearance(a);
}
