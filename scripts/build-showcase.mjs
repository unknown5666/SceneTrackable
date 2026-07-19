// ============================================================
// Showcase backup generator.
//
// Composes a SINGLE full-workspace backup that holds TWO complete productions
// so a restore lands a populated project switcher plus every collection the app
// renders:
//   • "Salt & Static"      (from scenetrackable-demo-showcase.json) — active
//   • "The Gift of the Magi" (from public/sample-production.json)   — second project
//
// Both source files are single-project persisted-store envelopes ({ state,
// version }); this merges them into one multi-project envelope. Users and roles
// are unioned (the demo's seeded Admin/1234 wins) so the file also works via the
// destructive "Replace entire workspace" path, not just the additive merge.
//
//   node scripts/build-showcase.mjs
//
// Emits scenetrackable-showcase.json at the repo root — push it, then restore
// it from Admin → Data.
// ============================================================

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// The state keys that make up ONE project's working set — must match
// blankData() in src/state/store.ts.
const DATA_KEYS = [
  "production", "crew", "cast", "scenes", "characterBible", "locations",
  "shootDays", "dood", "publishedSchedule", "locationLockDates", "tasks",
  "budgetLines", "purchaseOrders", "pettyCash", "vfxShots", "vfxVendors",
  "frequencyPlan", "rfEquipment", "cameraKits", "drones", "equipmentCheckouts",
  "checklists", "artElements", "continuityPhotos", "timesheet", "notifications",
  "activityLog", "aiDigest", "healthHistory",
];

const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

const pickData = (state) => {
  const out = {};
  for (const k of DATA_KEYS) out[k] = state[k];
  return out;
};

const summaryOf = (state) => {
  const p = state.projects?.[0];
  if (p) return p;
  const now = new Date().toISOString();
  const prod = state.production ?? {};
  return {
    id: prod.id ?? "proj_imported",
    name: prod.title ?? "Imported project",
    createdAt: now,
    updatedAt: now,
    currency: prod.currency ?? "AED",
  };
};

const unionBy = (a, b, key) => {
  const seen = new Set(a.map((x) => String(x[key]).toLowerCase()));
  return [...a, ...b.filter((x) => !seen.has(String(x[key]).toLowerCase()))];
};

// ------------------------------------------------------------
const demo = read("scenetrackable-demo-showcase.json"); // Salt & Static — active
const sample = read("public/sample-production.json"); // Gift of the Magi — second

const base = demo.state; // keeps Salt & Static's data at the top level (active)
const secondSummary = summaryOf(sample.state);
const secondData = pickData(sample.state);

const showcase = {
  state: {
    ...base,
    projects: [summaryOf(base), secondSummary],
    activeProjectId: base.activeProjectId ?? summaryOf(base).id,
    projectData: {
      ...(base.projectData ?? {}),
      [secondSummary.id]: secondData,
    },
    // Union users/roles so both productions' teams exist and login still works.
    users: unionBy(base.users ?? [], sample.state.users ?? [], "username"),
    roles: unionBy(base.roles ?? [], sample.state.roles ?? [], "id"),
  },
  version: demo.version ?? sample.version ?? 5,
};

const out = join(root, "scenetrackable-showcase.json");
writeFileSync(out, JSON.stringify(showcase, null, 2));

const s = showcase.state;
console.log("Wrote", out);
console.log("  projects:", s.projects.map((p) => p.name).join(", "));
console.log("  active:  ", s.activeProjectId);
console.log("  users:   ", s.users.map((u) => u.username).join(", "));
console.log("  scenes:  ", (s.scenes ?? []).length, "(active) +",
  (s.projectData[secondSummary.id].scenes ?? []).length, "(second)");
