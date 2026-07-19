// ============================================================
// BREAKDOWN VISUAL LANGUAGE
//
// Single source for the colors that encode breakdown data, so the same prop is
// green in the Breakdown table, the theater, Schedule and Reports. Keeping it
// here (not inline per page) is what makes the coding *consistent* — P3 #15.
// ============================================================

import type { ElementCategory, Scene } from "@/types";

export const CATEGORY_META: Record<ElementCategory, { label: string; color: string }> = {
  cast: { label: "Cast", color: "#4F7BF7" },
  extras: { label: "Extras", color: "#38BDF8" },
  props: { label: "Props", color: "#22C55E" },
  wardrobe: { label: "Wardrobe", color: "#EC4899" },
  sfx: { label: "SFX", color: "#EF4444" },
  vfx: { label: "VFX", color: "#8B5CF6" },
  vehicles: { label: "Vehicles", color: "#F59E0B" },
  animals: { label: "Animals", color: "#84CC16" },
  locations: { label: "Locations", color: "#14B8A6" },
  makeup: { label: "Makeup", color: "#F97316" },
  stunts: { label: "Stunts", color: "#DC2626" },
  production: { label: "Production Req.", color: "#94A3B8" },
};

export const CATEGORY_ORDER = Object.keys(CATEGORY_META) as ElementCategory[];

// ------------------------------------------------------------
// Time of day — warm for day, cool for night, transitional for dawn/dusk.
// ------------------------------------------------------------
export type TimeOfDay = Scene["timeOfDay"];

export const TIME_COLORS: Record<TimeOfDay, string> = {
  DAY: "#F59E0B",
  NIGHT: "#6366F1",
  DAWN: "#F472B6",
  DUSK: "#A855F7",
};

/** A tinted chip style {bg,color} for a time of day. */
export function timeChip(time: TimeOfDay): { background: string; color: string } {
  const c = TIME_COLORS[time];
  return { background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c };
}

// ------------------------------------------------------------
// INT / EXT — interiors read cool/blue, exteriors warm/teal.
// ------------------------------------------------------------
export const INTEXT_COLORS: Record<Scene["intExt"], string> = {
  INT: "#4F7BF7",
  EXT: "#14B8A6",
  "INT/EXT": "#8B5CF6",
};

export function intExtChip(intExt: Scene["intExt"]): { background: string; color: string } {
  const c = INTEXT_COLORS[intExt];
  return { background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c };
}
