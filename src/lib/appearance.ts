// ============================================================
// APPEARANCE — per-user accent color + density.
//
// Theme (dark/light/system) lives in state/theme.tsx. This handles the other
// two personal appearance knobs, applied as CSS custom properties / a root
// attribute so the whole token system picks them up. Persisted to localStorage
// and applied once at startup (see main.tsx) plus whenever Settings changes.
// ============================================================

export type Density = "comfortable" | "compact";

export interface Appearance {
  accent: string;
  density: Density;
}

export const ACCENTS: { name: string; value: string }[] = [
  { name: "Blue", value: "#4F7BF7" },
  { name: "Violet", value: "#8B5CF6" },
  { name: "Emerald", value: "#22C55E" },
  { name: "Amber", value: "#F59E0B" },
  { name: "Rose", value: "#F43F5E" },
  { name: "Cyan", value: "#06B6D4" },
];

const KEY = "st-appearance";
const DEFAULT: Appearance = { accent: "#4F7BF7", density: "comfortable" };

export function readAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        accent: typeof parsed.accent === "string" ? parsed.accent : DEFAULT.accent,
        density: parsed.density === "compact" ? "compact" : "comfortable",
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
}

export function saveAppearance(a: Appearance): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* ignore */
  }
  applyAppearance(a);
}
