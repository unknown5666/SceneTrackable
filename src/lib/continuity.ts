// ============================================================
// AI CONTINUITY ENGINE — digest + validation for scene-move proposals
//
// Mirrors the shape of lib/taskProposals.ts: a digest builder (what the model
// sees), a validator (what survives contact with the real schedule), and
// nothing else — the AI call itself lives in lib/claude.ts
// (aiContinuityOptimize), the review UI in pages/Schedule.tsx.
// ============================================================

import type { ProductionData } from "@/types";
import type { ProposedContinuityMove } from "@/lib/claude";
import { dayLocations, locKey, scenesAtLocation } from "@/lib/locations";

export interface ValidatedContinuityMove {
  sceneId: string;
  sceneNumber: string;
  toDay: number;
  reason: string;
}

export interface RejectedContinuityMove {
  sceneNumber: string;
  reason: string;
}

/**
 * The heuristic pre-analysis the AI reasons over: which locations and which
 * tracked wardrobe items are currently split across non-adjacent shoot days.
 * Doing this in code (rather than asking the model to spot it) means the
 * model only has to propose fixes, not first re-derive the schedule.
 */
export function buildContinuityDigest(d: ProductionData): string {
  const lines: string[] = [];
  const sortedDays = [...d.shootDays].sort((a, b) => a.dayNumber - b.dayNumber);
  const dayOf = new Map<string, number>();
  for (const day of sortedDays) for (const sid of day.scenes) dayOf.set(sid, day.dayNumber);

  lines.push("SHOOT DAYS:");
  if (sortedDays.length === 0) {
    lines.push("(none scheduled yet)");
  } else {
    for (const day of sortedDays) {
      lines.push(`Day ${day.dayNumber} — ${dayLocations(day).join(" → ") || "no location"}`);
    }
  }

  lines.push("\nLOCATION SPREAD (scenes at the same location, by day — flagging non-adjacent gaps):");
  let anyLocationFlag = false;
  for (const loc of d.locations) {
    const scenes = scenesAtLocation(d.scenes, loc);
    const days = [...new Set(scenes.map((s) => dayOf.get(s.id)).filter((n): n is number => n !== undefined))].sort(
      (a, b) => a - b
    );
    if (days.length < 2) continue;
    const spread = days[days.length - 1] - days[0];
    if (spread <= days.length) continue; // already adjacent/contiguous
    anyLocationFlag = true;
    lines.push(
      `${loc.name}: scenes ${scenes.map((s) => s.number).join(", ")} currently on days ${days.join(
        ", "
      )} — spread across ${spread + 1} days for only ${days.length} shoot days there.`
    );
  }
  if (!anyLocationFlag) lines.push("(no location is currently split across non-adjacent days)");

  lines.push("\nWARDROBE CONTINUITY (tracked wardrobe items whose scenes are far apart, by day):");
  let anyWardrobeFlag = false;
  for (const el of d.artElements) {
    if (el.category !== "wardrobe") continue;
    const days = [
      ...new Set(el.sceneIds.map((sid) => dayOf.get(sid)).filter((n): n is number => n !== undefined)),
    ].sort((a, b) => a - b);
    if (days.length < 2) continue;
    const spread = days[days.length - 1] - days[0];
    if (spread <= days.length) continue;
    anyWardrobeFlag = true;
    const sceneNumbers = el.sceneIds
      .map((sid) => d.scenes.find((s) => s.id === sid)?.number)
      .filter(Boolean)
      .join(", ");
    lines.push(
      `"${el.name}"${el.characterName ? ` (${el.characterName})` : ""}: scenes ${sceneNumbers} currently on days ${days.join(
        ", "
      )}.`
    );
  }
  if (!anyWardrobeFlag) lines.push("(no tracked wardrobe item is currently split across far-apart days)");

  if (d.production.principalPhotographyStart || d.production.principalPhotographyEnd) {
    lines.push(
      `\nPRINCIPAL PHOTOGRAPHY WINDOW: ${d.production.principalPhotographyStart ?? "no start set"} to ${
        d.production.principalPhotographyEnd ?? "no end set"
      }.`
    );
  }
  const locked = d.locations.filter((l) => l.lockDate);
  if (locked.length) {
    lines.push(
      `\nLOCATION LOCK DATES (do not move a scene to a day after its location's lock date): ${locked
        .map((l) => `${l.name} locks ${l.lockDate!.slice(0, 10)}`)
        .join("; ")}.`
    );
  }

  return lines.join("\n");
}

/**
 * Resolves the AI's scene-number-keyed moves against real records and rejects
 * anything that would violate a location lock date, fall outside the
 * principal-photography window, or name a scene/day that doesn't exist.
 */
export function validateContinuityMoves(
  moves: ProposedContinuityMove[],
  d: ProductionData
): { valid: ValidatedContinuityMove[]; rejected: RejectedContinuityMove[] } {
  const dayByNumber = new Map(d.shootDays.map((day) => [day.dayNumber, day]));
  const locByKey = new Map(d.locations.map((l) => [locKey(l.name), l]));
  const valid: ValidatedContinuityMove[] = [];
  const rejected: RejectedContinuityMove[] = [];

  for (const move of moves) {
    const scene = d.scenes.find((s) => s.number === move.sceneNumber.trim());
    if (!scene) {
      rejected.push({ sceneNumber: move.sceneNumber, reason: "no scene with that number" });
      continue;
    }
    const targetDay = dayByNumber.get(move.toDay);
    if (!targetDay) {
      rejected.push({ sceneNumber: move.sceneNumber, reason: `Day ${move.toDay} doesn't exist` });
      continue;
    }
    if (targetDay.date) {
      if (
        d.production.principalPhotographyStart &&
        targetDay.date.slice(0, 10) < d.production.principalPhotographyStart.slice(0, 10)
      ) {
        rejected.push({ sceneNumber: move.sceneNumber, reason: "before principal photography starts" });
        continue;
      }
      if (
        d.production.principalPhotographyEnd &&
        targetDay.date.slice(0, 10) > d.production.principalPhotographyEnd.slice(0, 10)
      ) {
        rejected.push({ sceneNumber: move.sceneNumber, reason: "after principal photography ends" });
        continue;
      }
    }
    const loc = locByKey.get(locKey(scene.location));
    if (loc?.lockDate && targetDay.date && targetDay.date.slice(0, 10) > loc.lockDate.slice(0, 10)) {
      rejected.push({
        sceneNumber: move.sceneNumber,
        reason: `${loc.name} locks ${loc.lockDate.slice(0, 10)}, before Day ${move.toDay}`,
      });
      continue;
    }
    valid.push({ sceneId: scene.id, sceneNumber: scene.number, toDay: move.toDay, reason: move.reason });
  }

  return { valid, rejected };
}
