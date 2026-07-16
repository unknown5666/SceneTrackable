// ============================================================
// PRODUCTION METRICS — every number the dashboard shows
//
// This file exists because the dashboard used to invent its KPIs: a literal
// 91% schedule adherence, a radar of five hardcoded scores, a sparkline of
// made-up history. Those numbers looked like measurements and weren't.
//
// The rule here: a metric is either computed from the store, or it is
// `undefined` and the UI says so. Never a plausible-looking constant.
// ============================================================

import type { ProductionData } from "@/types";
import { isOverdue } from "@/lib/utils";

/** A metric that may genuinely be unknowable from the data on hand. */
export type Maybe = number | undefined;

const ratio = (num: number, den: number): Maybe =>
  den > 0 ? num / den : undefined;

/** Shoot days at or before the production's current day — the work done. */
export function completedDays(d: ProductionData) {
  return d.shootDays.filter((day) => day.dayNumber <= d.production.currentShootDay);
}

/**
 * Scene ids scheduled on days that have already been shot.
 *
 * Only ids that resolve to a real scene count. A shoot day can hold a
 * reference to a scene that no longer exists — a deleted scene, or a board
 * built against a previous script — and counting those inflates every metric
 * derived from them. An unresolvable id is missing data, not progress.
 */
export function shotSceneIds(d: ProductionData): Set<string> {
  const real = new Set(d.scenes.map((s) => s.id));
  return new Set(completedDays(d).flatMap((day) => day.scenes).filter((id) => real.has(id)));
}

/** Scene ids on the board at all, that actually resolve to a scene. */
function scheduledSceneIds(d: ProductionData): Set<string> {
  const real = new Set(d.scenes.map((s) => s.id));
  return new Set(d.shootDays.flatMap((day) => day.scenes).filter((id) => real.has(id)));
}

/** Page count of a set of scene ids. */
export function pagesOf(d: ProductionData, sceneIds: Iterable<string>): number {
  const byId = new Map(d.scenes.map((s) => [s.id, s]));
  let total = 0;
  for (const id of sceneIds) total += byId.get(id)?.pages ?? 0;
  return Math.round(total * 1000) / 1000;
}

export interface ProductionMetrics {
  daysShot: number;
  totalDays: number;
  /** Fraction of the schedule shot. Undefined when no total is set. */
  scheduleProgress: Maybe;

  /** Pages on scenes scheduled to days already shot. */
  pagesShot: number;
  /** Pages the plan called for by now. */
  pagesPlannedToDate: Maybe;
  /** Actual pages per shot day. */
  pagesPerDay: Maybe;
  /** Actual minus planned pages/day. Negative = behind. */
  pagesPerDayDelta: Maybe;

  /** Scenes on shot days ÷ all scenes. */
  sceneCompletion: Maybe;
  /** Pages/day achieved ÷ pages/day planned, capped at 1. */
  pacePerformance: Maybe;

  totalBudgeted: number;
  totalSpent: number;
  totalCommitted: number;
  budgetBurn: Maybe;
  /** 1 − overrun vs where spend should be at this point in the schedule. */
  budgetAdherence: Maybe;

  taskCompletion: Maybe;
  overdueTaskCount: number;

  /** Final + delivered shots ÷ all shots. */
  vfxDelivery: Maybe;
  /** Returned checkouts ÷ all checkouts. */
  equipmentReadiness: Maybe;

  /** Composite of whatever axes exist. Undefined when nothing is measurable. */
  health: Maybe;
}

export function computeMetrics(d: ProductionData): ProductionMetrics {
  const daysShot = d.production.currentShootDay;
  const totalDays = Math.max(
    d.production.totalShootDays,
    d.shootDays.reduce((m, day) => Math.max(m, day.dayNumber), 0)
  );
  const scheduleProgress = ratio(daysShot, totalDays);

  const shot = shotSceneIds(d);
  const pagesShot = pagesOf(d, shot);
  const planned = d.production.plannedPagesPerDay;
  const pagesPlannedToDate = planned > 0 ? planned * daysShot : undefined;

  // Pace is only measurable once a shot day actually holds a scene. Dividing
  // by days when nothing is scheduled to them returns 0, which then reads as
  // "shot nothing, badly behind" — a verdict drawn from missing data rather
  // than from the production.
  const measurable = shot.size > 0;
  const pagesPerDay = measurable ? ratio(pagesShot, daysShot) : undefined;
  const pagesPerDayDelta =
    pagesPerDay !== undefined && planned > 0 ? pagesPerDay - planned : undefined;
  const pacePerformance =
    pagesPerDay !== undefined && planned > 0
      ? Math.min(1, pagesPerDay / planned)
      : undefined;

  // Completion is measured against the board: with nothing scheduled there is
  // no progress to report, rather than 0%.
  const sceneCompletion =
    scheduledSceneIds(d).size > 0 ? ratio(shot.size, d.scenes.length) : undefined;

  const totalBudgeted = d.budgetLines.reduce((s, l) => s + l.budgeted, 0);
  const totalSpent = d.budgetLines.reduce((s, l) => s + l.spent, 0);
  const totalCommitted = d.budgetLines.reduce((s, l) => s + l.committed, 0);
  const budgetBurn = ratio(totalSpent, totalBudgeted);
  // Spending 40% of the budget 40% of the way through is perfect adherence;
  // the score is how far off that line the production is.
  const budgetAdherence =
    budgetBurn !== undefined && scheduleProgress !== undefined
      ? Math.max(0, 1 - Math.abs(budgetBurn - scheduleProgress) * 2)
      : undefined;

  const completed = d.tasks.filter((t) => t.status === "completed").length;
  const taskCompletion = ratio(completed, d.tasks.length);
  const overdueTaskCount = d.tasks.filter(
    (t) => t.status !== "completed" && isOverdue(t.computedDeadline)
  ).length;

  const vfxDone = d.vfxShots.filter(
    (s) => s.status === "delivered" || s.status === "final"
  ).length;
  const vfxDelivery = ratio(vfxDone, d.vfxShots.length);

  const returned = d.equipmentCheckouts.filter((c) => c.returnAt).length;
  const equipmentReadiness = ratio(returned, d.equipmentCheckouts.length);

  // Health averages only the axes that exist. A production with no budget
  // loaded shouldn't be scored on budget adherence — or on a stand-in for it.
  const axes: { value: Maybe; weight: number }[] = [
    { value: pacePerformance, weight: 0.4 },
    { value: budgetAdherence, weight: 0.3 },
    { value: taskCompletion, weight: 0.3 },
  ];
  const present = axes.filter((a) => a.value !== undefined);
  const weightSum = present.reduce((s, a) => s + a.weight, 0);
  const health =
    weightSum > 0
      ? Math.round(
          (present.reduce((s, a) => s + (a.value as number) * a.weight, 0) / weightSum) * 100
        )
      : undefined;

  return {
    daysShot,
    totalDays,
    scheduleProgress,
    pagesShot,
    pagesPlannedToDate,
    pagesPerDay,
    pagesPerDayDelta,
    sceneCompletion,
    pacePerformance,
    totalBudgeted,
    totalSpent,
    totalCommitted,
    budgetBurn,
    budgetAdherence,
    taskCompletion,
    overdueTaskCount,
    vfxDelivery,
    equipmentReadiness,
    health,
  };
}

// ------------------------------------------------------------
// Radar
// ------------------------------------------------------------

export interface RadarAxis {
  axis: string;
  planned: number;
  actual: number;
}

/**
 * Radar axes, omitting anything the data can't support. The chart is hidden
 * below three axes — a two-spoke radar is a shape, not a chart.
 */
export function radarAxes(m: ProductionMetrics): RadarAxis[] {
  const candidates: [string, Maybe][] = [
    ["Pages/Day", m.pacePerformance],
    ["Scene Completion", m.sceneCompletion],
    ["Budget Adherence", m.budgetAdherence],
    ["Task Completion", m.taskCompletion],
    ["VFX Delivery", m.vfxDelivery],
    ["Equipment Readiness", m.equipmentReadiness],
  ];
  return candidates
    .filter(([, v]) => v !== undefined)
    .map(([axis, v]) => ({ axis, planned: 100, actual: Math.round((v as number) * 100) }));
}

// ------------------------------------------------------------
// Shooting pace chart
// ------------------------------------------------------------

export interface PaceRow {
  day: number;
  /** Pages scheduled to this day, once it's been shot. */
  shot?: number;
  /** Pages scheduled to this day, still ahead. */
  upcoming?: number;
  target: number;
  cumulativeShot?: number;
  cumulativeScheduled: number;
}

/**
 * Pages per shoot day, from the strip board.
 *
 * Note what this is and isn't: the app tracks which scenes are scheduled to a
 * day, not how many pages the unit actually got. So a shot day reports its
 * scheduled pages. That's a real number from real data — it just means "what
 * the plan says was covered", and the chart labels it that way.
 */
export function buildPaceChart(d: ProductionData): PaceRow[] {
  const byId = new Map(d.scenes.map((s) => [s.id, s]));
  const pagesFor = (ids: string[]) =>
    Math.round(ids.reduce((t, id) => t + (byId.get(id)?.pages ?? 0), 0) * 100) / 100;

  let cumulativeShot = 0;
  let cumulativeScheduled = 0;

  return [...d.shootDays]
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .map((day) => {
      const pages = pagesFor(day.scenes);
      const isShot = day.dayNumber <= d.production.currentShootDay;
      cumulativeScheduled += pages;
      if (isShot) cumulativeShot += pages;
      return {
        day: day.dayNumber,
        shot: isShot ? pages : undefined,
        upcoming: isShot ? undefined : pages,
        target: d.production.plannedPagesPerDay,
        cumulativeShot: isShot ? Math.round(cumulativeShot * 10) / 10 : undefined,
        cumulativeScheduled: Math.round(cumulativeScheduled * 10) / 10,
      };
    });
}

// ------------------------------------------------------------
// Weekly spend
// ------------------------------------------------------------

export interface SpendWeek {
  week: string;
  spent: number;
  committed: number;
}

/** Monday of the week containing this date. */
function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

/**
 * Real weekly burn, from the two things that carry a date and an amount:
 * petty cash entries and purchase orders. Budget lines hold no dates, so they
 * can't produce a time series — the alternative to this was random numbers.
 */
export function buildSpendChart(d: ProductionData, weeks = 6): SpendWeek[] {
  const spent = new Map<string, number>();
  const committed = new Map<string, number>();

  const bump = (map: Map<string, number>, iso: string | undefined, amount: number) => {
    if (!iso) return;
    const k = weekStart(iso);
    map.set(k, (map.get(k) ?? 0) + amount);
  };

  for (const e of d.pettyCash) bump(spent, e.date, e.amount);
  for (const po of d.purchaseOrders) {
    if (po.status === "approved") bump(spent, po.requestedAt, po.amount);
    else if (po.status !== "rejected" && po.status !== "draft")
      bump(committed, po.requestedAt, po.amount);
  }

  const keys = [...new Set([...spent.keys(), ...committed.keys()])].sort();
  return keys.slice(-weeks).map((k) => ({
    week: k.slice(5), // MM-DD
    spent: Math.round(spent.get(k) ?? 0),
    committed: Math.round(committed.get(k) ?? 0),
  }));
}

// ------------------------------------------------------------
// Digest input
// ------------------------------------------------------------

export interface DigestInput {
  /** The full prompt input: facts plus any notes for the model. */
  text: string;
  /** The fact lines alone — what demo mode is allowed to show the user. */
  facts: string;
  /** Changes when any number in the digest changes — the cache key. */
  hash: string;
}

/** Cheap, stable string hash. Not security — just cache invalidation. */
function hashString(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * The real state of the production, as the digest's input.
 *
 * Everything here is measured. The previous version of this prompt asserted a
 * hardcoded "schedule adherence 91%" and asked the model to comment on it,
 * which produced confident sentences about a number nobody computed.
 */
export function buildDigestInput(d: ProductionData): DigestInput {
  const m = computeMetrics(d);
  const cur = d.production.currency;
  const lines: string[] = [];
  /** Notes addressed to the model, never shown to the user. */
  const guidance: string[] = [];
  const pct = (v: Maybe) => (v === undefined ? "not tracked" : `${Math.round(v * 100)}%`);

  lines.push(`PRODUCTION: ${d.production.title}`);
  lines.push(
    `SCHEDULE: day ${m.daysShot} of ${m.totalDays} (${pct(m.scheduleProgress)} of the schedule).`
  );
  // Fact lines and model guidance are kept apart: the demo digest shows the
  // facts verbatim, and an instruction aimed at the model would read as
  // nonsense sitting in the user's dashboard.
  if (m.pagesPerDay === undefined) {
    lines.push(
      `PAGES: no scenes are scheduled to the days shot so far, so shooting pace cannot be measured. Target is ${
        d.production.plannedPagesPerDay || "not set"
      } pages/day.`
    );
    guidance.push(
      "Shooting pace is unmeasurable: do not call the production behind or ahead. The board simply isn't filled in."
    );
  } else {
    lines.push(
      `PAGES: ${m.pagesShot} pages on days shot so far; the plan called for ${
        m.pagesPlannedToDate ?? "no target"
      }. Actual pace ${m.pagesPerDay.toFixed(2)} pages/day against a target of ${
        d.production.plannedPagesPerDay || "none set"
      }.`
    );
  }
  const scheduled = scheduledSceneIds(d).size;
  lines.push(
    `SCENES: ${d.scenes.length} in the script; ${scheduled} are on the board; ${
      shotSceneIds(d).size
    } are on days already shot.`
  );
  lines.push(
    `BUDGET: ${m.totalSpent} spent and ${m.totalCommitted} committed of ${m.totalBudgeted} ${cur} (burn ${pct(
      m.budgetBurn
    )} against ${pct(m.scheduleProgress)} of the schedule).`
  );

  const hotLines = d.budgetLines
    .filter((l) => l.budgeted > 0 && l.spent / l.budgeted > 0.9)
    .map((l) => `${l.code} ${l.description} at ${Math.round((l.spent / l.budgeted) * 100)}%`);
  lines.push(
    `BUDGET LINES OVER 90% SPENT: ${hotLines.length ? hotLines.join("; ") : "none"}.`
  );

  const overdue = d.tasks
    .filter((t) => t.status !== "completed" && isOverdue(t.computedDeadline))
    .sort((a, b) => a.computedDeadline.localeCompare(b.computedDeadline))
    .slice(0, 5)
    .map((t) => {
      const days = Math.floor(
        (Date.now() - new Date(t.computedDeadline).getTime()) / 86_400_000
      );
      const owner = d.crew.find((c) => c.id === t.owner)?.name ?? "unassigned";
      return `“${t.title}” (${t.department}, ${owner}, ${days}d overdue)`;
    });
  lines.push(
    `OVERDUE TASKS: ${m.overdueTaskCount} total${
      overdue.length ? `. Worst: ${overdue.join("; ")}` : ""
    }.`
  );

  const pendingPOs = d.purchaseOrders.filter((p) =>
    ["submitted", "accountant_review", "admin_approval"].includes(p.status)
  );
  lines.push(
    `PENDING POs: ${pendingPOs.length}${
      pendingPOs.length
        ? ` worth ${pendingPOs.reduce((s, p) => s + p.amount, 0)} ${cur}, oldest ${
            pendingPOs
              .map((p) => p.requestedAt.slice(0, 10))
              .sort()[0]
          }`
        : ""
    }.`
  );

  const soon = d.locations
    .filter((l) => {
      if (!l.lockDate) return false;
      const days = (new Date(l.lockDate).getTime() - Date.now()) / 86_400_000;
      return days >= 0 && days <= 7;
    })
    .map((l) => `${l.name} (${l.lockDate!.slice(0, 10)}, ${l.permitStatus})`);
  lines.push(`LOCATION LOCKS WITHIN 7 DAYS: ${soon.length ? soon.join("; ") : "none"}.`);

  // A cast member working two locations on one day is a real scheduling
  // failure, and it's derivable, so it belongs in the digest.
  const conflicts: string[] = [];
  for (const c of d.cast) {
    const byDay = new Map<number, Set<string>>();
    for (const day of d.shootDays) {
      if (!day.scenes.some((id) => c.scenes.includes(id))) continue;
      const set = byDay.get(day.dayNumber) ?? new Set();
      set.add(day.location);
      byDay.set(day.dayNumber, set);
    }
    for (const [day, locs] of byDay) {
      if (locs.size > 1) conflicts.push(`${c.name} on day ${day} across ${[...locs].join(" and ")}`);
    }
  }
  lines.push(`CAST CONFLICTS: ${conflicts.length ? conflicts.join("; ") : "none"}.`);

  // The hash covers the facts only — guidance is derived from them, so it
  // can't change on its own and shouldn't invalidate a cached digest.
  const text = lines.join("\n");
  const full = guidance.length ? `${text}\n\nNOTES:\n${guidance.map((g) => `- ${g}`).join("\n")}` : text;
  return { text: full, facts: text, hash: hashString(text) };
}
