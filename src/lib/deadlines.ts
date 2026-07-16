// ============================================================
// DEADLINE EXPRESSION EVALUATOR
//
// Supported forms:
//   manual(YYYY-MM-DD)
//   shoot_day(N) [+|- Nd]
//   location_lock(LOC_ID) [+|- Nd]
//
// The evaluator receives a ScheduleContext with the current
// shoot day mapping and any recorded location lock dates.
// ============================================================

import type { ShootDay } from "@/types";

export interface ScheduleContext {
  shootDays: ShootDay[];
  locationLockDates?: Record<string, string>;
}

export interface ParsedDeadlineRule {
  kind: "manual" | "shoot_day" | "location_lock";
  arg: string;
  offsetDays: number; // negative or positive
  raw: string;
}

const EXPR = /^\s*(manual|shoot_day|location_lock)\(\s*([^)]+?)\s*\)\s*(?:([+-])\s*(\d+)\s*d)?\s*$/i;

export function parseDeadlineRule(rule: string): ParsedDeadlineRule | null {
  const m = rule.match(EXPR);
  if (!m) return null;
  const [, kind, arg, sign, days] = m;
  const offsetDays = sign && days ? (sign === "+" ? 1 : -1) * parseInt(days, 10) : 0;
  return {
    kind: kind.toLowerCase() as ParsedDeadlineRule["kind"],
    arg,
    offsetDays,
    raw: rule,
  };
}

const addDays = (dateISO: string, days: number): string => {
  const d = new Date(dateISO);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
};

export function evaluateDeadline(
  rule: string,
  ctx: ScheduleContext
): string | null {
  const parsed = parseDeadlineRule(rule);
  if (!parsed) return null;

  switch (parsed.kind) {
    case "manual": {
      // parsed.arg is YYYY-MM-DD
      const base = new Date(parsed.arg + "T09:00:00.000Z").toISOString();
      return addDays(base, parsed.offsetDays);
    }
    case "shoot_day": {
      const n = parseInt(parsed.arg, 10);
      const day = ctx.shootDays.find((d) => d.dayNumber === n);
      if (!day) return null;
      return addDays(day.date, parsed.offsetDays);
    }
    case "location_lock": {
      const lockDate = ctx.locationLockDates?.[parsed.arg];
      if (!lockDate) return null;
      return addDays(lockDate, parsed.offsetDays);
    }
  }
}

/** Human-friendly render of a rule, e.g. "3 days before Day 15" */
export function humanizeRule(rule: string): string {
  const parsed = parseDeadlineRule(rule);
  if (!parsed) return rule;
  const dir =
    parsed.offsetDays === 0
      ? "on"
      : parsed.offsetDays > 0
      ? `${parsed.offsetDays}d after`
      : `${Math.abs(parsed.offsetDays)}d before`;
  switch (parsed.kind) {
    case "manual":
      return parsed.offsetDays === 0
        ? `${parsed.arg}`
        : `${dir} ${parsed.arg}`;
    case "shoot_day":
      return `${dir} Day ${parsed.arg}`;
    case "location_lock":
      return `${dir} lock of ${parsed.arg}`;
  }
}
