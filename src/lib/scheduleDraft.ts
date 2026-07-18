// ============================================================
// SCHEDULE DRAFT — input digest, validation, and the demo fallback
//
// The AI half lives in claude.ts. This is what it's shown, what survives
// validation, and what the app drafts with no key.
// ============================================================

import type { ProductionData, ProposedDayRecord, Scene, ShootDay } from "@/types";
import type { ProposedDay } from "@/lib/claude";
import { locKey } from "@/lib/locations";

/** Canonical location for a scene — the record's name when one covers it. */
export function canonicalLocation(scene: Scene, d: ProductionData): string {
  const hit = d.locations.find((l) =>
    [l.name, ...(l.aliases ?? [])].some((n) => locKey(n) === locKey(scene.location))
  );
  return hit?.name ?? scene.location;
}

/** The next weekday at or after a date. */
function nextWeekday(date: Date): Date {
  const d = new Date(date);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** Consecutive shooting dates from a start, skipping weekends. */
export function shootingDates(startISO: string, count: number): string[] {
  const out: string[] = [];
  let cur = nextWeekday(new Date(startISO));
  for (let i = 0; i < count; i++) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
    cur = nextWeekday(cur);
  }
  return out;
}

/** Where the board starts: the earliest day already on it, else today. */
export function defaultStartDate(d: ProductionData): string {
  const dates = d.shootDays.map((day) => day.date).filter(Boolean).sort();
  return (dates[0] ?? new Date().toISOString()).slice(0, 10);
}

/**
 * What the model sees. Scene text is left out entirely — a strip board is
 * built from headings, page counts and who's in the scene, and the screenplay
 * would cost an order of magnitude more tokens to say the same thing.
 */
export function buildScheduleDigest(
  d: ProductionData,
  startDate: string,
  scenes: Scene[]
): string {
  const lines: string[] = [];
  const target = d.production.plannedPagesPerDay;
  const totalPages = scenes.reduce((s, sc) => s + sc.pages, 0);

  lines.push("CONSTRAINTS:");
  lines.push(`- Start date: ${startDate} (first shooting day).`);
  lines.push(`- Shooting week: Monday to Friday. No weekends.`);
  lines.push(
    `- Target pages per day: ${target || "not set — aim for a balanced board of roughly equal days"}.`
  );
  lines.push(
    `- ${scenes.length} scenes, ${
      Math.round(totalPages * 10) / 10
    } pages total${target ? `, implying roughly ${Math.ceil(totalPages / target)} shooting days` : ""}.`
  );

  lines.push("\nSCENES:");
  for (const s of scenes) {
    const cast = s.elements
      .filter((e) => e.category === "cast")
      .map((e) => e.name)
      .join(", ");
    const flags = [s.vfxFlags ? "VFX" : "", s.sfxFlags ? "SFX" : ""].filter(Boolean).join("+");
    lines.push(
      `${s.number} | ${s.intExt} | ${canonicalLocation(s, d)} | ${s.timeOfDay} | ${
        s.pages
      }pg | cast: ${cast || "none tagged"}${flags ? ` | ${flags}` : ""}${
        s.synopsis ? ` | ${s.synopsis.slice(0, 110)}` : ""
      }`
    );
  }

  return lines.join("\n");
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

export interface ValidatedDay {
  day: ProposedDay;
  scenes: Scene[];
  pages: number;
}

export interface ScheduleValidation {
  days: ValidatedDay[];
  /** Scenes the draft didn't place — they stay in the unassigned pool. */
  unplaced: Scene[];
  problems: string[];
}

/**
 * Cleans a proposed board into one the app can actually commit.
 *
 * A model can hallucinate a scene number, place a scene twice, or number days
 * with gaps. Each of those would corrupt the board, so each is repaired here
 * (dropping the bad reference) and reported rather than trusted.
 */
export function validateSchedule(
  proposed: ProposedDay[],
  scenes: Scene[],
  startDate: string
): ScheduleValidation {
  const byNumber = new Map(scenes.map((s) => [s.number.trim(), s]));
  const used = new Set<string>();
  const problems: string[] = [];
  const days: ValidatedDay[] = [];

  const sorted = [...proposed].sort((a, b) => a.dayNumber - b.dayNumber);

  for (const day of sorted) {
    const dayScenes: Scene[] = [];
    for (const num of day.sceneNumbers) {
      const key = num.trim();
      const scene = byNumber.get(key);
      if (!scene) {
        problems.push(`Day ${day.dayNumber} referenced scene ${key}, which doesn't exist.`);
        continue;
      }
      if (used.has(scene.id)) {
        problems.push(`Scene ${key} was placed twice; kept its first day.`);
        continue;
      }
      used.add(scene.id);
      dayScenes.push(scene);
    }
    if (dayScenes.length === 0) {
      problems.push(`Day ${day.dayNumber} had no valid scenes and was dropped.`);
      continue;
    }
    days.push({
      day,
      scenes: dayScenes,
      pages: Math.round(dayScenes.reduce((s, sc) => s + sc.pages, 0) * 100) / 100,
    });
  }

  // Renumber and re-date from scratch: gaps, duplicate numbers and weekend
  // dates are all easier to fix here than to trust the model to avoid.
  const dates = shootingDates(startDate, days.length);
  days.forEach((v, i) => {
    v.day = { ...v.day, dayNumber: i + 1, date: dates[i] };
  });

  return {
    days,
    unplaced: scenes.filter((s) => !used.has(s.id)),
    problems,
  };
}

// ------------------------------------------------------------
// Demo fallback — deterministic board, no API key needed
// ------------------------------------------------------------

/**
 * Groups by location, then splits day work from night work, then packs to the
 * page target. That's the same first principle the prompt leads with — group
 * by location to kill company moves — just without the judgement calls.
 */
export function demoScheduleDraft(
  d: ProductionData,
  scenes: Scene[],
  startDate: string
): ProposedDay[] {
  const target = d.production.plannedPagesPerDay || 4;

  const groups = new Map<string, Scene[]>();
  for (const s of scenes) {
    // Night and day work at one location are different units of work, so they
    // never share a strip.
    const isNight = s.timeOfDay === "NIGHT" || s.timeOfDay === "DUSK";
    const key = `${canonicalLocation(s, d)}\0${isNight ? "NIGHT" : "DAY"}`;
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  const days: { location: string; scenes: Scene[] }[] = [];
  for (const [key, groupScenes] of groups) {
    const location = key.split("\0")[0];
    let current: Scene[] = [];
    let pages = 0;
    for (const s of groupScenes) {
      // Start a new day once this one is full — unless it's still empty, in
      // which case a single oversized scene gets its own day.
      if (current.length > 0 && pages + s.pages > target) {
        days.push({ location, scenes: current });
        current = [];
        pages = 0;
      }
      current.push(s);
      pages += s.pages;
    }
    if (current.length) days.push({ location, scenes: current });
  }

  const dates = shootingDates(startDate, days.length);
  return days.map((day, i) => {
    const pages = day.scenes.reduce((s, sc) => s + sc.pages, 0);
    const night = day.scenes.some((s) => s.timeOfDay === "NIGHT" || s.timeOfDay === "DUSK");
    return {
      dayNumber: i + 1,
      date: dates[i],
      location: day.location,
      sceneNumbers: day.scenes.map((s) => s.number),
      estimatedHours: Math.min(14, Math.max(8, Math.round(pages * 2 + 4))),
      rationale: `${day.scenes.length} ${night ? "night" : "day"} scene${
        day.scenes.length === 1 ? "" : "s"
      } at ${day.location}, ${Math.round(pages * 10) / 10} pages.`,
    };
  });
}

/** A validated day as a shoot-day record. */
export function shootDayFromProposal(v: ValidatedDay): ProposedDayRecord {
  const locations = v.day.locations?.length ? v.day.locations : [v.day.location].filter(Boolean);
  return {
    dayNumber: v.day.dayNumber,
    date: v.day.date,
    // `location` stays the first for old consumers; `locations` carries the move.
    location: locations[0] ?? v.day.location,
    locations: locations.length > 1 ? locations : undefined,
    estimatedHours: v.day.estimatedHours,
    scenes: v.scenes.map((s) => s.id),
    banners: [],
  } satisfies Omit<ShootDay, "id">;
}
