/**
 * Builds the shipped «مزرعة يدو ٣» production — an Emirati feature, 91 scenes,
 * budgeted in AED — into public/mazraat-yadoo-3.json.
 *
 * Written in TypeScript and run through tsx, unlike the other generators,
 * because it deliberately does *not* hand-author its scenes: it runs the
 * committed screenplay and budget text through `parseScreenplay` and
 * `parseBudgetText` — the same functions the app runs on an upload. That makes
 * this file a standing check on both. If the Arabic slugline forms or the RTL
 * number repair regress, this stops producing 91 scenes and a AED 772,000 top
 * sheet, and it stops loudly.
 *
 *   npx tsx scripts/build-yadoo.ts
 *
 * Sources (extracted with scripts/arabic-pdf-repro.ts, committed under
 * scripts/data/): the shooting script and the estimated budget, both supplied
 * by the production.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseScreenplay, extractCharacters } from "../src/lib/script";
import { parseBudgetText, toBudgetLines, foldArabic } from "../src/lib/budgetImport";
import type {
  Scene,
  CastMember,
  CrewMember,
  ProductionLocation,
  ShootDay,
  DoodMatrix,
  Task,
} from "../src/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_TXT = join(__dirname, "data", "mazraat-yadoo-3.txt");
const BUDGET_TXT = join(__dirname, "data", "mazraat-yadoo-3-budget.txt");
const OUT = join(__dirname, "..", "public", "mazraat-yadoo-3.json");

// Deterministic ISO helpers, anchored so the production reads as "in prep".
const DAY = 86400000;
const now = new Date("2026-07-19T09:00:00.000Z");
const iso = (offsetDays: number, h = 9) =>
  new Date(now.getTime() + offsetDays * DAY + (h - 9) * 3600000).toISOString();
const dateOnly = (offsetDays: number) => iso(offsetDays).slice(0, 10);

// ------------------------------------------------------------
// SCENES
// ------------------------------------------------------------
const scenes: Scene[] = parseScreenplay(readFileSync(SCRIPT_TXT, "utf8"));

/**
 * The script's own numbering has a defect near the end: after scene 89 it runs
 * 92, 90, 92 — two scenes share a number and one is out of sequence. The parser
 * reads a repeated number as the start of a new episode (which is right for the
 * serial it was written for) and qualifies the last one "2-92".
 *
 * Renumbering here rather than in the parser: the parser is behaving correctly
 * on the input it was given, and the input is what's wrong. These three are
 * renumbered to 90, 91, 92 in the order they appear in the script.
 */
const RENUMBER: Record<string, string> = { "92": "90", "90": "91", "2-92": "92" };
for (const sc of scenes.slice(-3)) {
  const fixed = RENUMBER[sc.number];
  if (fixed) sc.number = fixed;
}

const sceneByNumber = new Map(scenes.map((s) => [s.number, s]));
const sceneId = (n: string) => sceneByNumber.get(n)?.id ?? "";
const totalPages = scenes.reduce((s, sc) => s + sc.pages, 0);

// ------------------------------------------------------------
// BUDGET — the production's own estimate, read by the importer
// ------------------------------------------------------------
const parsedBudget = parseBudgetText(readFileSync(BUDGET_TXT, "utf8"));

/**
 * Rows the budget lists as line items but puts no figure against — a camera
 * rental, a lighting package, a crane/dolly hire.
 *
 * They are carried through at zero, not filled in. Inventing a plausible rate
 * would put a number on this production's top sheet that nobody in the
 * production ever wrote, and it would be indistinguishable from the figures
 * that are real. Zero is visible on the top sheet as "no figure yet", which is
 * exactly what the source says. In the app itself these are the rows the import
 * modal stops and asks the user about; the generator has nobody to ask.
 */
const unpriced = parsedBudget.rows.filter((r) => r.amount === null);
for (const row of unpriced) row.amount = 0;

const unsectioned = parsedBudget.rows.filter((r) => !r.section);
if (unsectioned.length > 0) {
  console.error(
    `Budget rows the parser could not place:\n${unsectioned
      .map((r) => `  ${r.code || "—"} ${r.description}`)
      .join("\n")}`
  );
  process.exit(1);
}

// budgeted comes from the file; committed and spent are zero because the file
// says nothing about what has been committed or paid.
const budgetLines = toBudgetLines(parsedBudget.rows, "ar");
const budgetTotal = budgetLines.reduce((s, l) => s + l.budgeted, 0);

// ------------------------------------------------------------
// CREW — the budget's own crew rows, and the script's title page
// ------------------------------------------------------------
/**
 * Only the two documents. The budget's «الطاقم الفني» rows name the positions
 * the production is paying for, and the script's title page names the three
 * people credited on it. Nobody else is added, and no rates are set: the budget
 * gives a lump sum per position, not an hourly rate, and deriving one would
 * mean inventing a day count.
 */
const crew: CrewMember[] = [
  // Credited on the script's title page.
  { id: "crew_writer", name: "أحمد زين الهاشمي", role: "تأليف وإخراج", department: "production", roleId: "admin" },
  { id: "crew_writer2", name: "أحمد خاطر", role: "سيناريو وحوار", department: "production" },
  // Positions listed in the budget. Unnamed there, so the position is the name.
  { id: "crew_exec", name: "مخرج منفذ", role: "مخرج منفذ", department: "production", roleId: "scheduler" },
  { id: "crew_1ad", name: "مساعد مخرج وسكريبت", role: "مساعد مخرج وسكريبت", department: "production", roleId: "scheduler" },
  { id: "crew_dp", name: "مدير التصوير ومساعده", role: "مدير التصوير ومساعده", department: "camera", roleId: "camera" },
  { id: "crew_gaffer", name: "فني إضاءة (٤)", role: "فني إضاءة عدد ٤", department: "camera", roleId: "camera" },
  { id: "crew_sound", name: "مهندس صوت ومساعده", role: "مهندس صوت ومساعده", department: "sound", roleId: "camera" },
  { id: "crew_makeup", name: "ماكير (٢)", role: "ماكير عدد ٢", department: "wardrobe", roleId: "art" },
  { id: "crew_pm", name: "مدير إدارة إنتاج", role: "مدير إدارة إنتاج", department: "production", roleId: "scheduler" },
  { id: "crew_pa", name: "منفذو الإنتاج (٢)", role: "منفذو الإنتاج عدد ٢", department: "production" },
  { id: "crew_art", name: "الديكورات ومشرف الإكسسوارات", role: "ديكورات وإكسسوارات", department: "art", roleId: "art" },
  { id: "crew_dit", name: "DIT", role: "DIT", department: "camera", roleId: "camera" },
];

// ------------------------------------------------------------
// CAST — the characters the script's dialogue cues name
// ------------------------------------------------------------
/**
 * The speaking characters, by the name the script's dialogue cues use. Gender
 * is the one attribute taken from the script rather than counted — مريم and
 * المطوعة are written as women, the rest as men.
 *
 * No rates. The budget gives one lump sum for «أجور الفنانين + الكومبارس»
 * (15 people, 150,000) and never breaks it down, so any per-day figure here
 * would be one this production never set.
 */
const CHARACTERS: { name: string; gender: CastMember["gender"]; spellings?: string[] }[] = [
  { name: "خالد", gender: "M" },
  { name: "ياسر", gender: "M" },
  // The script writes the final ya both ways for this one.
  { name: "الرمسي", gender: "M", spellings: ["الرمسي", "الرمسى"] },
  { name: "سعيد", gender: "M" },
  { name: "عبدالله", gender: "M" },
  { name: "مرشد", gender: "M" },
  { name: "علي", gender: "M" },
  { name: "مريم", gender: "F" },
  { name: "المطوعة", gender: "F" },
  { name: "شهداد", gender: "M" },
];

const detected = new Set(extractCharacters(scenes));
const missing = CHARACTERS.filter(
  (c) => ![c.name, ...(c.spellings ?? [])].some((s) => detected.has(s))
).map((c) => c.name);
if (missing.length > 0) {
  console.warn(`⚠ characters not detected in the script text: ${missing.join(", ")}`);
}

/**
 * A character is in a scene when the scene's text names them, and their billing
 * follows how many scenes that is. Both are counted off the script rather than
 * asserted, so the cast page, the DOOD and the scene list can't disagree with
 * what's actually on the page.
 *
 * Matched as whole words, not substrings: علي is a name *and* sits inside عليه,
 * عليك and علينا, so a substring test puts him in 72 of 91 scenes and makes him
 * the lead of a film he supports. Arabic has no `\b` in JS — it is ASCII-only —
 * so the text is tokenized instead.
 *
 * And tokenized WITHOUT `foldArabic`, which is the fold the budget importer
 * uses. That fold maps ى to ي, which is right for matching budget keywords and
 * catastrophic here: it merges the name علي with على, the commonest preposition
 * in the language, and hands him 90 of 91 scenes. Where a name really is spelled
 * two ways the spellings are listed instead — narrow, and visible.
 */
const normalize = (s: string) => s.replace(/[أإآ]/g, "ا");

/**
 * Whether a scene really features a character.
 *
 * One bare mention isn't enough, because a name can be a word: «ال تتأخرون علي»
 * is "don't keep me waiting", and it would otherwise put the boy علي in a hotel
 * room he is never in. So a scene counts when the name heads a line — which is
 * how this script writes a dialogue cue — or when it appears more than once,
 * which no passing preposition does.
 *
 * A heuristic, and it is only used to seed the cast page and the DOOD; the AI
 * character pass replaces it with a real read of the script.
 */
function featuresCharacter(scriptText: string, forms: string[]): boolean {
  let mentions = 0;
  for (const rawLine of scriptText.split("\n")) {
    const line = normalize(rawLine).trim();
    if (!line) continue;
    const words = line.split(/[^\p{L}]+/u).filter(Boolean);
    if (words.length === 0) continue;
    // A cue: the name opens a short line — «خالد ( يضحك )», «ياسر».
    if (forms.includes(words[0]) && words.length <= 4) return true;
    for (const w of words) if (forms.includes(w)) mentions++;
    if (mentions > 1) return true;
  }
  return false;
}

const appearances = new Map(
  CHARACTERS.map((c) => {
    const forms = [c.name, ...(c.spellings ?? [])].map(normalize);
    return [c.name, scenes.filter((s) => featuresCharacter(s.scriptText, forms))];
  })
);
const mostScenes = Math.max(...[...appearances.values()].map((v) => v.length));
const billing = (name: string): CastMember["category"] => {
  const n = appearances.get(name)?.length ?? 0;
  if (n >= mostScenes * 0.5) return "lead";
  return n >= mostScenes * 0.15 ? "supporting" : "day_player";
};

const cast: CastMember[] = CHARACTERS.map((c, i) => ({
  id: `cast_${i + 1}`,
  name: c.name,
  role: c.name,
  category: billing(c.name),
  scenes: (appearances.get(c.name) ?? []).map((s) => s.id),
  ratePerDay: 0,
  gender: c.gender,
}));

const characterBible = CHARACTERS.map((c) => {
  const cat = billing(c.name);
  return {
    name: c.name,
    speaking: true,
    importance: (cat === "day_player" ? "minor" : cat) as "lead" | "supporting" | "minor",
    firstSceneNumber: appearances.get(c.name)?.[0]?.number,
  };
});

// ------------------------------------------------------------
// LOCATIONS — consolidated from the sluglines
// ------------------------------------------------------------
/**
 * The script names a place many ways — «بيت ياسر . الصالة», «بيت ياسر . غرفة
 * علي», «حديقة بيت ياسر» are three sluglines at one address. Grouping by the
 * leading field is what turns 91 sluglines into the handful of units that
 * actually have to be scouted, permitted and moved between.
 */
const LOCATION_GROUPS: { name: string; match: RegExp }[] = [
  { name: "مزرعة يدو", match: /المزرعة|مزرعة يدو|فناء المزرعة|ساحة المزرعة|بوابة المزرعة|ممرات المزرعة|محيط المزرعة|وسط المزرعة/ },
  { name: "بيت ياسر", match: /بيت ياسر|حديقة بيت ياسر/ },
  { name: "بيت المطوعة", match: /بيت المطوعة|حوش بيت المطوعة/ },
  { name: "مركز الساونا", match: /الساونا/ },
  { name: "فندق عبدالله", match: /بالفندق/ },
  { name: "بيت عبدالله", match: /بيت عبدالله/ },
  { name: "بيت الرمسي", match: /بيت الرمسى|بيت الرمسي/ },
  { name: "بيت خالد", match: /بيت خالد/ },
  { name: "الصحراء", match: /الصحراء/ },
  { name: "الطريق", match: /الطريق|قرية شعبية/ },
  { name: "الكافيه", match: /الكافية|كافية/ },
  // The parking corridor (sc. 28) is the hall's — it plays straight off the
  // celebration scenes either side of it, so it shoots with them.
  { name: "قاعة الاحتفال", match: /قاعة الاحتفال|قاعة االحتفال|باركينج|موقف/ },
  { name: "مطعم أنيق", match: /مطعم/ },
  { name: "دار النشر", match: /دار نشر/ },
  { name: "مزارع أخرى", match: /مزرعة اصدقاء|مزرعة آبل|احدى المزارع|مزرعة ياسر|مزرعة/ },
];

/** The unit a slugline's location belongs to. */
function unitFor(location: string): string {
  for (const g of LOCATION_GROUPS) if (g.match.test(location)) return g.name;
  return "مواقع متفرقة";
}

/**
 * Every unit starts at "scouting" and carries no day rate and no lock date.
 * Neither document says a word about what has been secured, permitted or
 * priced, and "scouting" is the status that claims nothing. INT/EXT is read
 * off the sluglines that use the unit, so a unit played both ways is INT/EXT.
 */
const usedUnits = new Set(scenes.map((s) => unitFor(s.location)));
const locations: ProductionLocation[] = LOCATION_GROUPS.filter((g) => usedUnits.has(g.name)).map(
  (g, i) => {
    const inUnit = scenes.filter((s) => unitFor(s.location) === g.name);
    const kinds = new Set(inUnit.map((s) => s.intExt));
    return {
      id: `loc_${i + 1}`,
      name: g.name,
      aliases: [...new Set(inUnit.map((s) => s.location))].slice(0, 8),
      type: (kinds.size === 1 ? [...kinds][0] : "INT/EXT") as ProductionLocation["type"],
      permitStatus: "scouting" as const,
      notes: `${inUnit.length} ${inUnit.length === 1 ? "مشهد" : "مشهدًا"} في هذا الموقع.`,
    };
  }
);
if (usedUnits.has("مواقع متفرقة")) {
  locations.push({
    id: `loc_${locations.length + 1}`,
    name: "مواقع متفرقة",
    type: "INT/EXT",
    permitStatus: "scouting",
    notes: "مشاهد لم تُسنَد بعد إلى وحدة تصوير.",
  });
}

// ------------------------------------------------------------
// SCHEDULE — scenes banked by unit, so days don't company-move needlessly
// ------------------------------------------------------------
/**
 * Days are built by filling one location unit at a time up to the planned page
 * count. Shooting a location out is how a schedule is actually built, and it is
 * what makes the strip board legible: the alternative — scenes in script order
 * — produces a board that moves the whole unit four times a day.
 */
// A planning default, not something either document states — it's the knob the
// 1st AD turns on the Schedule page, and the strip board is built from it.
const PAGES_PER_DAY = 4;
const shootDays: ShootDay[] = [];
let dayNumber = 0;
for (const unit of locations.map((l) => l.name)) {
  const inUnit = scenes.filter((s) => unitFor(s.location) === unit);
  let bucket: Scene[] = [];
  let pages = 0;
  const closeDay = () => {
    if (bucket.length === 0) return;
    dayNumber += 1;
    shootDays.push({
      id: `day_${dayNumber}`,
      dayNumber,
      date: dateOnly(dayNumber + 6),
      location: unit,
      locations: [unit],
      // Straight from the page count. No call or wrap times and no meal
      // banners: those are the 1st AD's to set, and neither document sets them.
      estimatedHours: Math.min(12, Math.max(8, Math.round(pages * 2.5))),
      scenes: bucket.map((s) => s.id),
    });
    bucket = [];
    pages = 0;
  };
  for (const sc of inUnit) {
    if (pages + sc.pages > PAGES_PER_DAY && bucket.length > 0) closeDay();
    bucket.push(sc);
    pages += sc.pages;
  }
  closeDay();
}

// ------------------------------------------------------------
// DOOD — worked when the actor's scenes fall on the day
// ------------------------------------------------------------
const dood: DoodMatrix = {};
for (const member of cast) {
  const row: Record<number, "W" | "SW" | "WF" | "SWF" | "H" | "OFF"> = {};
  const working = shootDays
    .filter((d) => d.scenes.some((sid) => member.scenes.includes(sid)))
    .map((d) => d.dayNumber);
  if (working.length === 0) continue;
  const first = working[0];
  const last = working[working.length - 1];
  for (const d of shootDays) {
    const n = d.dayNumber;
    if (!working.includes(n)) {
      // Held between the first and last working day, off outside it.
      row[n] = n > first && n < last ? "H" : "OFF";
      continue;
    }
    row[n] = n === first && n === last ? "SWF" : n === first ? "SW" : n === last ? "WF" : "W";
  }
  dood[member.id] = row;
}

// ------------------------------------------------------------
// TASKS — none
// ------------------------------------------------------------
/**
 * Empty, deliberately. A task list is a record of what a production has decided
 * to do and who owes it; neither the script nor the budget records any such
 * decision, so every task here would be a guess about this crew's work dressed
 * up as their plan. The Tasks page has an empty state for exactly this.
 */
const tasks: Task[] = [];

// ------------------------------------------------------------
// ASSEMBLE
// ------------------------------------------------------------
const elementCount = scenes.reduce((s, sc) => s + sc.elements.length, 0);
const projectId = "proj_yadoo3";

const production = {
  id: "prod_yadoo3",
  // As the script's title page writes it.
  title: "مزرعة يدو 3",
  currency: parsedBudget.currency ?? "AED",
  budget: budgetTotal,
  totalShootDays: shootDays.length,
  currentShootDay: 0,
  plannedPagesPerDay: PAGES_PER_DAY,
  script: { totalPages: Math.round(totalPages * 10) / 10, totalScenes: scenes.length },
};

/**
 * No notifications, no health history, and an activity log holding only the two
 * things that did happen: this generator imported the script and the budget.
 * Everything else would be a fabricated record of work by people who are named
 * on a real film.
 */
const notifications: never[] = [];

const activityLog = [
  { id: "a_1", at: iso(-1), userId: "", userLabel: "System", action: "imported", entity: "scene", description: `استيراد السيناريو — ${scenes.length} مشهدًا` },
  { id: "a_2", at: iso(-1, 10), userId: "", userLabel: "System", action: "imported", entity: "budget", description: `استيراد ملف الميزانية — ${budgetLines.length} بندًا بقيمة ${budgetTotal.toLocaleString()} درهم` },
];

const healthHistory: never[] = [];

const productionData = {
  production,
  crew,
  cast,
  scenes,
  characterBible,
  locations,
  shootDays,
  dood,
  publishedSchedule: { version: 1, publishedAt: iso(-2), lastChanges: [] },
  locationLockDates: {},
  tasks,
  budgetLines,
  purchaseOrders: [],
  pettyCash: [],
  vfxShots: [],
  vfxVendors: [],
  frequencyPlan: [],
  rfEquipment: [],
  cameraKits: [],
  drones: [],
  equipmentCheckouts: [],
  checklists: [],
  artElements: [],
  continuityPhotos: [],
  timesheet: [],
  notifications,
  activityLog,
  // No aiDigest: a digest is model output, and hand-writing one would put words
  // in the AI's mouth. The dashboard reads "AI summary pending" until a real
  // run produces one.
  healthHistory,
};

// Roles and users mirror scripts/build-sample.mjs — they must stay valid
// against src/data/roles.ts, and a restore unions them with what's there.
const permissionMapFrom = (read: string[], write: string[]) => {
  const KEYS = ["breakdown", "schedule", "locations", "tasks", "budget", "vfx", "rf", "camera", "drones", "art", "cast", "timesheet", "reports"];
  const m: Record<string, string> = {};
  for (const k of KEYS) m[k] = "none";
  for (const k of read) m[k] = "read";
  for (const k of write) m[k] = "write";
  return m;
};
const roles = [
  { id: "admin", label: "Administrator", description: "Full oversight of every project, department, users, roles, and AI.", access: ["all"], builtIn: true },
  { id: "scheduler", label: "1st AD / Scheduler", description: "Owns the shooting schedule, strip board, and DOOD.", access: ["breakdown", "schedule", "locations", "tasks", "cast", "reports"], permissions: permissionMapFrom(["breakdown", "reports"], ["schedule", "locations", "tasks", "cast"]), builtIn: true },
  { id: "accountant", label: "Accountant", description: "Manages the budget, POs, invoices, and petty cash.", department: "accounting", access: ["budget", "tasks", "reports"], permissions: permissionMapFrom(["reports"], ["budget", "tasks"]), builtIn: true },
  { id: "camera", label: "Camera / Technical", description: "Equipment manifests, kit builds, and prep checklists.", department: "camera", access: ["camera", "drones", "breakdown", "schedule", "tasks"], permissions: permissionMapFrom(["breakdown", "schedule"], ["camera", "drones", "tasks"]), builtIn: true },
  { id: "vfx", label: "VFX Supervisor", description: "Shot pipeline, vendor management, plate delivery.", department: "vfx", access: ["vfx", "breakdown", "tasks"], permissions: permissionMapFrom(["breakdown"], ["vfx", "tasks"]), builtIn: true },
  { id: "art", label: "Art / Wardrobe / Props", description: "Element tracking, continuity, and set dressing.", department: "art", access: ["art", "breakdown", "tasks"], permissions: permissionMapFrom(["breakdown"], ["art", "tasks"]), builtIn: true },
  { id: "cast", label: "Cast Coordinator", description: "Cast schedules, DOOD, contracts, and call sheets.", department: "cast", access: ["cast", "schedule", "tasks"], permissions: permissionMapFrom([], ["cast", "schedule", "tasks"]), builtIn: true },
];

// Only the seeded master admin. The teammates that were here before were
// invented people on a real production's workspace. sha256("1234").
const users = [
  { id: "user_admin", username: "Admin", displayName: "Administrator", password: "sha256$03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4", roleId: "admin", active: true, createdAt: iso(-30) },
];

const project = {
  id: projectId,
  name: production.title,
  // The script's title page, verbatim — not a logline written for it.
  logline: "تأليف أحمد زين الهاشمي · سيناريو وحوار أحمد خاطر · إخراج أحمد زين الهاشمي",
  createdAt: iso(-1),
  updatedAt: iso(0),
  currency: production.currency,
  script: {
    fileName: "مزرعة يدو النسخة final.pdf",
    rawText: readFileSync(SCRIPT_TXT, "utf8"),
    uploadedAt: iso(-1),
    pageCount: 95,
    source: "pdf" as const,
  },
  sceneCount: scenes.length,
  elementCount,
};

const state = {
  ...productionData,
  users,
  roles,
  currentUserId: "user_admin",
  activeRole: "admin",
  tutorialSeen: true,
  sidebarPinned: true,
  projects: [project],
  activeProjectId: projectId,
  projectData: {},
  // No AI has run on this production, so there is no usage to report.
  aiUsage: [],
  aiConfig: { alertThresholdPct: 80 },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ state, version: 5 }, null, 2), "utf8");

const nightScenes = scenes.filter((s) => s.timeOfDay === "NIGHT").length;
console.log(
  `Wrote ${OUT}\n` +
    `  scenes=${scenes.length} (${nightScenes} night) pages=${Math.round(totalPages)} ` +
    `cast=${cast.length} crew=${crew.length} locations=${locations.length} days=${shootDays.length}\n` +
    `  budget=${production.currency} ${budgetTotal.toLocaleString()} across ${budgetLines.length} lines ` +
    `(file stated ${parsedBudget.declaredTotal?.toLocaleString() ?? "—"})` +
    (unpriced.length
      ? `\n  ${unpriced.length} row(s) carry no figure in the source and are left at 0: ` +
        unpriced.map((r) => `${r.code} ${r.description}`).join("; ")
      : "")
);
