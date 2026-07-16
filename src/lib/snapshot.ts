// ============================================================
// PRODUCTION SNAPSHOT — the data an "ask the production" question is answered from
//
// Two rules shape this file:
//  1. No script text. It is by far the largest thing in the store and answers
//     questions ("which days is BEA on?") that the structured data answers
//     better and cheaper.
//  2. A hard size cap. A 90-day show would otherwise send a request that costs
//     more than the answer is worth — so sections are dropped largest-first,
//     and the model is *told* what was dropped rather than left to infer that
//     the production simply has no budget.
// ============================================================

import type { ProductionData } from "@/types";
import { scenesAtLocation } from "@/lib/locations";

/** Ceiling on the serialized snapshot, in characters (~8k tokens). */
export const SNAPSHOT_CHAR_CAP = 30_000;

type Section = { key: string; label: string; value: unknown };

export interface SnapshotResult {
  json: string;
  /** Sections dropped to fit the cap, largest first. */
  omitted: string[];
}

function sceneNumbers(d: ProductionData, ids: string[]): string[] {
  const map: Record<string, string> = {};
  for (const s of d.scenes) map[s.id] = s.number;
  return ids.map((id) => map[id] ?? id);
}

/**
 * Builds the snapshot, dropping whole sections until it fits.
 *
 * Sections go in priority order — meta and schedule first, because they're
 * what most questions are about — and the largest of the *droppable* ones goes
 * first when trimming is needed.
 */
export function buildSnapshot(d: ProductionData): SnapshotResult {
  const sections: Section[] = [
    {
      key: "production",
      label: "production meta",
      value: {
        title: d.production.title,
        currency: d.production.currency,
        budget: d.production.budget,
        totalShootDays: d.production.totalShootDays,
        currentShootDay: d.production.currentShootDay,
        plannedPagesPerDay: d.production.plannedPagesPerDay,
        totalPages: d.production.script.totalPages,
        totalScenes: d.production.script.totalScenes,
      },
    },
    {
      key: "shootDays",
      label: "shoot days",
      value: [...d.shootDays]
        .sort((a, b) => a.dayNumber - b.dayNumber)
        .map((day) => ({
          day: day.dayNumber,
          date: day.date?.slice(0, 10),
          location: day.location,
          callTime: day.callTime,
          scenes: sceneNumbers(d, day.scenes),
        })),
    },
    {
      key: "cast",
      label: "cast",
      value: d.cast.map((c) => ({
        name: c.name,
        character: c.role,
        category: c.category,
        ratePerDay: c.ratePerDay,
        scenes: sceneNumbers(d, c.scenes),
        // The DOOD is the answer to "which days is X on set?", so it travels
        // with the cast member rather than as its own section.
        days: Object.entries(d.dood[c.id] ?? {})
          .filter(([, status]) => status !== "OFF")
          .map(([day, status]) => `${day}:${status}`),
      })),
    },
    {
      key: "locations",
      label: "locations",
      value: d.locations.map((l) => ({
        name: l.name,
        aliases: l.aliases,
        type: l.type,
        permitStatus: l.permitStatus,
        lockDate: l.lockDate?.slice(0, 10),
        costPerDay: l.costPerDay,
        scenes: scenesAtLocation(d.scenes, l).map((s) => s.number),
      })),
    },
    {
      key: "budget",
      label: "budget lines",
      value: d.budgetLines.map((l) => ({
        code: l.code,
        description: l.description,
        department: l.department,
        budgeted: l.budgeted,
        committed: l.committed,
        spent: l.spent,
      })),
    },
    {
      key: "tasks",
      label: "tasks",
      value: d.tasks.map((t) => ({
        title: t.title,
        department: t.department,
        status: t.status,
        priority: t.priority,
        deadline: t.computedDeadline?.slice(0, 10),
      })),
    },
    {
      key: "scenes",
      label: "scenes",
      // Deliberately no scriptText — the heading, the page count and the cast
      // present are what questions are actually about.
      value: d.scenes.map((s) => ({
        number: s.number,
        intExt: s.intExt,
        location: s.location,
        timeOfDay: s.timeOfDay,
        pages: s.pages,
        synopsis: s.synopsis,
        cast: s.elements.filter((e) => e.category === "cast").map((e) => e.name),
        vfx: s.vfxFlags || undefined,
        sfx: s.sfxFlags || undefined,
      })),
    },
  ];

  const omitted: string[] = [];
  const serialize = () => {
    const obj: Record<string, unknown> = {};
    for (const s of sections) obj[s.key] = s.value;
    if (omitted.length) {
      // Without this the model reads a missing section as "not tracked" and
      // says so with confidence. Tell it the difference.
      obj._omitted = `These sections exist in the production but were too large to include: ${omitted.join(
        ", "
      )}. Do not claim they are empty or untracked — say you couldn't see them.`;
    }
    return JSON.stringify(obj);
  };

  let json = serialize();
  while (json.length > SNAPSHOT_CHAR_CAP && sections.length > 1) {
    // Never drop production meta — it's small and nearly every answer needs it.
    const droppable = sections.filter((s) => s.key !== "production");
    let biggest = droppable[0];
    let biggestSize = 0;
    for (const s of droppable) {
      const size = JSON.stringify(s.value).length;
      if (size > biggestSize) {
        biggest = s;
        biggestSize = size;
      }
    }
    if (!biggest) break;
    sections.splice(sections.indexOf(biggest), 1);
    omitted.push(biggest.label);
    json = serialize();
  }

  return { json, omitted };
}
