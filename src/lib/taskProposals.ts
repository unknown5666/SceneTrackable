// ============================================================
// TASK PROPOSALS — input digest, validation, and demo fallback
//
// The AI half lives in claude.ts. This is everything around it: what the model
// is shown, what survives validation, and what the app proposes with no key.
// ============================================================

import type {
  DepartmentId,
  ProductionData,
  ProposedTaskRecord,
  Scene,
  Task,
} from "@/types";
import type { ProposedTask } from "@/lib/claude";
import { MAX_TASK_PROPOSALS } from "@/lib/claude";
import { evaluateDeadline } from "@/lib/deadlines";
import { resolveLockDates } from "@/lib/locations";

/** Element categories -> the department that preps them. */
const CATEGORY_DEPARTMENT: Record<string, DepartmentId> = {
  cast: "cast",
  extras: "cast",
  props: "props",
  wardrobe: "wardrobe",
  makeup: "art",
  sfx: "sound",
  vfx: "vfx",
  vehicles: "transport",
  animals: "production",
  locations: "production",
  stunts: "production",
  production: "production",
};

/**
 * What the model sees. Deliberately compact: element names and categories per
 * scene, not script text — the task is inferring prep work from the breakdown,
 * and the screenplay would cost 10x the tokens without helping.
 */
export function buildTaskDigest(d: ProductionData): string {
  const lines: string[] = [];

  const byDept = new Map<DepartmentId, string[]>();
  for (const scene of d.scenes) {
    for (const el of scene.elements) {
      const dept = el.linkedDepartment ?? CATEGORY_DEPARTMENT[el.category] ?? "production";
      const arr = byDept.get(dept) ?? [];
      arr.push(
        `Sc ${scene.number}: ${el.name} [${el.category}${
          el.subCategory ? `/${el.subCategory}` : ""
        }]${el.description ? ` — ${el.description}` : ""}`
      );
      byDept.set(dept, arr);
    }
  }

  lines.push("BREAKDOWN ELEMENTS BY DEPARTMENT:");
  for (const [dept, entries] of byDept) {
    lines.push(`\n## ${dept}`);
    // A department with hundreds of elements would swamp the request; the
    // model only needs enough to see the pattern of work.
    lines.push(entries.slice(0, 80).join("\n"));
    if (entries.length > 80) lines.push(`… and ${entries.length - 80} more ${dept} elements`);
  }

  lines.push("\n\nSHOOT DAYS:");
  if (d.shootDays.length === 0) {
    lines.push("(none scheduled yet — shoot_day() rules are unavailable)");
  } else {
    const nums: Record<string, string> = {};
    for (const s of d.scenes) nums[s.id] = s.number;
    for (const day of [...d.shootDays].sort((a, b) => a.dayNumber - b.dayNumber)) {
      lines.push(
        `Day ${day.dayNumber} — ${day.date?.slice(0, 10) ?? "no date"} — ${day.location} — scenes ${
          day.scenes.map((id) => nums[id] ?? id).join(", ") || "none"
        }`
      );
    }
  }

  lines.push("\nLOCATIONS (valid names for location_lock rules):");
  const locationNames = d.locations.length
    ? d.locations.map(
        (l) => `${l.name} [${l.type}, ${l.permitStatus}${l.lockDate ? `, locks ${l.lockDate.slice(0, 10)}` : ""}]`
      )
    : ["(none recorded — location_lock() rules are unavailable)"];
  lines.push(locationNames.join("\n"));

  lines.push("\nTASKS THAT ALREADY EXIST (do not duplicate):");
  lines.push(
    d.tasks.length ? d.tasks.map((t) => `- ${t.title} [${t.department}]`).join("\n") : "(none)"
  );

  return lines.join("\n");
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

export interface ValidatedTask {
  proposal: ProposedTask;
  /** The scene the proposal named, resolved to a real record. */
  scene?: Scene;
  computedDeadline: string;
}

/**
 * Keeps only proposals whose deadline rule the app can actually evaluate. A
 * rule naming a shoot day or location that doesn't exist yields a task with no
 * real deadline, which is worse than no task.
 */
export function validateProposals(
  proposals: ProposedTask[],
  d: ProductionData
): { valid: ValidatedTask[]; rejected: { title: string; reason: string }[] } {
  const ctx = {
    shootDays: d.shootDays,
    locationLockDates: resolveLockDates(d.locations, d.locationLockDates),
  };
  const valid: ValidatedTask[] = [];
  const rejected: { title: string; reason: string }[] = [];
  const seen = new Set(d.tasks.map((t) => t.title.trim().toLowerCase()));

  for (const p of proposals) {
    const key = p.title.trim().toLowerCase();
    if (seen.has(key)) {
      rejected.push({ title: p.title, reason: "duplicates an existing task" });
      continue;
    }
    const computed = evaluateDeadline(p.deadlineRule, ctx);
    if (!computed) {
      rejected.push({
        title: p.title,
        reason: `deadline “${p.deadlineRule}” doesn't resolve`,
      });
      continue;
    }
    seen.add(key);
    valid.push({
      proposal: p,
      scene: p.linkedScene
        ? d.scenes.find((s) => s.number === p.linkedScene!.trim())
        : undefined,
      computedDeadline: computed,
    });
  }
  return { valid, rejected };
}

// ------------------------------------------------------------
// Demo fallback — rule-based, no API key needed
// ------------------------------------------------------------

/** The earliest day a scene shoots, for anchoring a deadline to real work. */
function firstDayForScenes(d: ProductionData, sceneIds: Set<string>): number | undefined {
  const days = d.shootDays
    .filter((day) => day.scenes.some((id) => sceneIds.has(id)))
    .map((day) => day.dayNumber)
    .sort((a, b) => a - b);
  return days[0];
}

/**
 * What the app proposes with no API key: the tasks that follow mechanically
 * from the breakdown — a permit per exterior location, a fitting per wardrobe
 * element, a wrangler per animal. Narrower than the model, but every one is
 * real work with a real deadline.
 */
export function demoTaskProposals(d: ProductionData): ProposedTask[] {
  const out: ProposedTask[] = [];
  const existing = new Set(d.tasks.map((t) => t.title.trim().toLowerCase()));
  const add = (t: ProposedTask) => {
    if (existing.has(t.title.trim().toLowerCase())) return;
    existing.add(t.title.trim().toLowerCase());
    out.push(t);
  };

  // Deadlines need an anchor that resolves, so only propose against days and
  // locations that exist.
  const anchor = (sceneIds: Set<string>, lead: number): string | undefined => {
    const day = firstDayForScenes(d, sceneIds);
    return day === undefined ? undefined : `shoot_day(${day}) - ${lead}d`;
  };

  // ---- Locations: permits and scouts ----
  for (const loc of d.locations) {
    if (loc.permitStatus === "wrapped") continue;
    const rule = loc.lockDate ? `location_lock(${loc.name}) - 7d` : undefined;
    const sceneIds = new Set(
      d.scenes
        .filter((s) =>
          [loc.name, ...(loc.aliases ?? [])].some(
            (n) => n.trim().toLowerCase() === s.location.trim().toLowerCase()
          )
        )
        .map((s) => s.id)
    );
    const fallback = anchor(sceneIds, 14);
    const deadlineRule = rule ?? fallback;
    if (!deadlineRule) continue;
    if (loc.type === "EXT" || loc.type === "INT/EXT") {
      add({
        title: `Film permit — ${loc.name}`,
        department: "production",
        priority: "high",
        deadlineRule,
        notes: "Exterior location: permit, road closure and parking need lead time.",
      });
    }
    if (loc.permitStatus === "scouting") {
      add({
        title: `Tech scout — ${loc.name}`,
        department: "production",
        priority: "medium",
        deadlineRule,
      });
    }
  }

  // ---- Elements: department prep ----
  const elementsByName = new Map<
    string,
    { category: string; sceneIds: Set<string>; scene: Scene }
  >();
  for (const scene of d.scenes) {
    for (const el of scene.elements) {
      const key = `${el.category}:${el.name.toLowerCase()}`;
      const hit = elementsByName.get(key);
      if (hit) hit.sceneIds.add(scene.id);
      else
        elementsByName.set(key, {
          category: el.category,
          sceneIds: new Set([scene.id]),
          scene,
        });
    }
  }

  for (const [key, info] of elementsByName) {
    const name = key.split(":").slice(1).join(":");
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    switch (info.category) {
      case "wardrobe": {
        const rule = anchor(info.sceneIds, 7);
        if (rule)
          add({
            title: `Fitting — ${label}`,
            department: "wardrobe",
            priority: "medium",
            linkedScene: info.scene.number,
            deadlineRule: rule,
          });
        break;
      }
      case "animals": {
        const rule = anchor(info.sceneIds, 10);
        if (rule)
          add({
            title: `Book wrangler + welfare officer — ${label}`,
            department: "production",
            priority: "high",
            linkedScene: info.scene.number,
            deadlineRule: rule,
            notes: "Animal on set: wrangler, welfare sign-off and insurance.",
          });
        break;
      }
      case "stunts": {
        const rule = anchor(info.sceneIds, 14);
        if (rule)
          add({
            title: `Stunt rehearsal + risk assessment — ${label}`,
            department: "production",
            priority: "critical",
            linkedScene: info.scene.number,
            deadlineRule: rule,
          });
        break;
      }
      case "sfx": {
        const rule = anchor(info.sceneIds, 7);
        if (rule)
          add({
            title: `Safety brief — ${label}`,
            department: "sound",
            priority: "high",
            linkedScene: info.scene.number,
            deadlineRule: rule,
          });
        break;
      }
      case "vehicles": {
        const rule = anchor(info.sceneIds, 5);
        if (rule)
          add({
            title: `Prep picture vehicle — ${label}`,
            department: "transport",
            priority: "medium",
            linkedScene: info.scene.number,
            deadlineRule: rule,
          });
        break;
      }
      case "props": {
        const rule = anchor(info.sceneIds, 5);
        if (rule)
          add({
            title: `Source prop — ${label}`,
            department: "props",
            priority: "medium",
            linkedScene: info.scene.number,
            deadlineRule: rule,
          });
        break;
      }
      case "vfx": {
        const rule = anchor(info.sceneIds, 3);
        if (rule)
          add({
            title: `Plate + methodology brief — ${label}`,
            department: "vfx",
            priority: "medium",
            linkedScene: info.scene.number,
            deadlineRule: rule,
          });
        break;
      }
    }
    if (out.length >= MAX_TASK_PROPOSALS) break;
  }

  return out.slice(0, MAX_TASK_PROPOSALS);
}

/** A validated proposal as a task record, ready for `createTask`. */
export function taskFromProposal(
  v: ValidatedTask,
  owner: string
): ProposedTaskRecord {
  return {
    title: v.proposal.title,
    description: v.proposal.notes,
    owner,
    department: v.proposal.department,
    linkedScene: v.scene?.id,
    deadlineRule: v.proposal.deadlineRule,
    computedDeadline: v.computedDeadline,
    status: "not_started",
    priority: v.proposal.priority,
    createdByAI: true,
  } satisfies Omit<Task, "id" | "createdAt" | "updatedAt">;
}
