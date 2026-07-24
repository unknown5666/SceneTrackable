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
import { parseBudgetText, toBudgetLines } from "../src/lib/budgetImport";
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
 * The three rows the file leaves blank — a camera-body rental, a lighting
 * package and a crane/dolly hire, all written as line items with no figure
 * against them. In the app these are exactly the rows the import modal stops
 * and asks about; here they are answered, at the rates the rest of the sheet
 * implies, so the shipped production has a complete top sheet.
 */
const FILLED_AMOUNTS: Record<string, number> = {
  "20": 60000, // أجار كاميرة تصوير
  "21": 45000, // إضاءة ومعدات كاملة + سيارة معدات
  "23": 25000, // استئجار كرين وشاريو
};
for (const row of parsedBudget.rows) {
  if (row.amount === null && FILLED_AMOUNTS[row.code] !== undefined) {
    row.amount = FILLED_AMOUNTS[row.code];
  }
}

const unresolved = parsedBudget.rows.filter((r) => !r.section || r.amount === null);
if (unresolved.length > 0) {
  console.error(
    `Budget rows the parser could not resolve:\n${unresolved
      .map((r) => `  ${r.code || "—"} ${r.description}`)
      .join("\n")}`
  );
  process.exit(1);
}

const budgetLines = toBudgetLines(parsedBudget.rows, "ar");
// Committed/spent dressing: prep has begun, so the above-the-line and
// production rows are committed and partly paid while the shoot hasn't started.
const COMMITTED_PCT: Record<string, [number, number]> = {
  "فوق الخط": [1, 0.5],
  "الطاقم الفني": [1, 0.25],
  التصوير: [0.6, 0],
  "الإضاءة والمعدات": [0.5, 0],
  الصوت: [0.5, 0],
  "الديكور والإكسسوارات": [0.4, 0.1],
  "الماكياج والشعر": [0.3, 0],
  "الممثلون والكومبارس": [0.8, 0.2],
  "مواقع التصوير": [0.5, 0.15],
  "النقل والمواصلات": [0.3, 0.1],
  "الإعاشة والإقامة": [0.2, 0],
  "ما بعد الإنتاج": [0, 0],
  "مصاريف أخرى وطوارئ": [0.2, 0.2],
};
for (const line of budgetLines) {
  const [c, s] = COMMITTED_PCT[line.category] ?? [0, 0];
  line.committed = Math.round(line.budgeted * c);
  line.spent = Math.round(line.budgeted * s);
}
const budgetTotal = budgetLines.reduce((s, l) => s + l.budgeted, 0);

// ------------------------------------------------------------
// CREW — read off the budget's own crew rows
// ------------------------------------------------------------
const crew: CrewMember[] = [
  { id: "crew_writer", name: "أحمد زين الهاشمي", role: "مؤلف ومخرج", department: "production", roleId: "admin" },
  { id: "crew_writer2", name: "أحمد خاطر", role: "سيناريو وحوار", department: "production" },
  { id: "crew_exec", name: "مخرج منفذ", role: "مخرج منفذ", department: "production", roleId: "scheduler", ratePerHour: 250 },
  { id: "crew_1ad", name: "مساعد مخرج وسكريبت", role: "مساعد مخرج / سكريبت", department: "production", roleId: "scheduler", ratePerHour: 140 },
  { id: "crew_dp", name: "مدير التصوير", role: "مدير تصوير", department: "camera", roleId: "camera", ratePerHour: 320 },
  { id: "crew_gaffer", name: "فني إضاءة", role: "فني إضاءة (٤)", department: "camera", roleId: "camera", ratePerHour: 110 },
  { id: "crew_sound", name: "مهندس الصوت", role: "مهندس صوت ومساعده", department: "sound", roleId: "camera", ratePerHour: 180 },
  { id: "crew_makeup", name: "الماكير", role: "ماكير (٢)", department: "wardrobe", roleId: "art", ratePerHour: 120 },
  { id: "crew_pm", name: "مدير إدارة الإنتاج", role: "مدير إدارة إنتاج", department: "production", roleId: "scheduler", ratePerHour: 260 },
  { id: "crew_pa", name: "منفذو الإنتاج", role: "منفذ إنتاج (٢)", department: "production", ratePerHour: 90 },
  { id: "crew_art", name: "مشرف الديكور والإكسسوارات", role: "ديكور وإكسسوارات", department: "art", roleId: "art", ratePerHour: 130 },
  { id: "crew_dit", name: "الـ DIT", role: "DIT", department: "camera", roleId: "camera", ratePerHour: 150 },
  { id: "crew_acct", name: "المحاسب", role: "محاسب الإنتاج", department: "accounting", roleId: "accountant", ratePerHour: 160 },
];

// ------------------------------------------------------------
// CAST — the characters the script's dialogue cues name
// ------------------------------------------------------------
/**
 * Leads and their rates, in script order of prominence. The names are checked
 * against `extractCharacters` below rather than trusted: if the cue detection
 * regresses, a lead silently disappearing from the cast list is the kind of
 * thing that would otherwise go unnoticed until a call sheet was wrong.
 */
const LEADS: [string, CastMember["category"], number, CastMember["gender"]][] = [
  ["خالد", "lead", 4500, "M"],
  ["ياسر", "lead", 4500, "M"],
  ["الرمسي", "lead", 4000, "M"],
  ["سعيد", "lead", 4000, "M"],
  ["عبدالله", "lead", 4000, "M"],
  ["مرشد", "supporting", 3000, "M"],
  ["علي", "supporting", 2500, "M"],
  ["مريم", "supporting", 2800, "F"],
  ["المطوعة", "supporting", 2600, "F"],
  ["شهداد", "day_player", 1800, "M"],
];

const detected = new Set(extractCharacters(scenes));
const missing = LEADS.map(([n]) => n).filter((n) => !detected.has(n));
if (missing.length > 0) {
  console.warn(`⚠ characters not detected in the script text: ${missing.join(", ")}`);
}

const cast: CastMember[] = LEADS.map(([name, category, ratePerDay, gender], i) => ({
  id: `cast_${i + 1}`,
  name,
  role: name,
  category,
  // A character is in a scene when the scene's text names them. Coarse, but it
  // is read off the real script rather than invented, so the DOOD and the
  // scene counts on the cast page agree with what's on the page.
  scenes: scenes.filter((s) => s.scriptText.includes(name)).map((s) => s.id),
  ratePerDay,
  gender,
}));

const characterBible = LEADS.map(([name, category]) => ({
  name,
  speaking: true,
  importance: (category === "lead"
    ? "lead"
    : category === "supporting"
      ? "supporting"
      : "minor") as "lead" | "supporting" | "minor",
  firstSceneNumber: scenes.find((s) => s.scriptText.includes(name))?.number,
}));

// ------------------------------------------------------------
// LOCATIONS — consolidated from the sluglines
// ------------------------------------------------------------
/**
 * The script names a place many ways — «بيت ياسر . الصالة», «بيت ياسر . غرفة
 * علي», «حديقة بيت ياسر» are three sluglines at one address. Grouping by the
 * leading field is what turns 91 sluglines into the handful of units that
 * actually have to be scouted, permitted and moved between.
 */
const LOCATION_GROUPS: { name: string; match: RegExp; type: ProductionLocation["type"]; permitStatus: ProductionLocation["permitStatus"] }[] = [
  { name: "مزرعة يدو", match: /المزرعة|مزرعة يدو|فناء المزرعة|ساحة المزرعة|بوابة المزرعة|ممرات المزرعة|محيط المزرعة|وسط المزرعة/, type: "INT/EXT", permitStatus: "locked" },
  { name: "بيت ياسر", match: /بيت ياسر|حديقة بيت ياسر/, type: "INT/EXT", permitStatus: "locked" },
  { name: "بيت المطوعة", match: /بيت المطوعة|حوش بيت المطوعة/, type: "INT/EXT", permitStatus: "permit_pending" },
  { name: "مركز الساونا", match: /الساونا/, type: "INT", permitStatus: "optioned" },
  { name: "فندق عبدالله", match: /بالفندق/, type: "INT", permitStatus: "optioned" },
  { name: "بيت عبدالله", match: /بيت عبدالله/, type: "INT", permitStatus: "scouting" },
  { name: "بيت الرمسي", match: /بيت الرمسى|بيت الرمسي/, type: "INT", permitStatus: "scouting" },
  { name: "بيت خالد", match: /بيت خالد/, type: "INT", permitStatus: "scouting" },
  { name: "الصحراء", match: /الصحراء/, type: "EXT", permitStatus: "permit_pending" },
  { name: "الطريق", match: /الطريق|قرية شعبية/, type: "EXT", permitStatus: "permit_pending" },
  { name: "الكافيه", match: /الكافية|كافية/, type: "INT", permitStatus: "optioned" },
  // The parking corridor (sc. 28) is the hall's — it plays straight off the
  // celebration scenes either side of it, so it shoots with them.
  { name: "قاعة الاحتفال", match: /قاعة الاحتفال|قاعة االحتفال|باركينج|موقف/, type: "INT", permitStatus: "optioned" },
  { name: "مطعم أنيق", match: /مطعم/, type: "INT", permitStatus: "scouting" },
  { name: "دار النشر", match: /دار نشر/, type: "EXT", permitStatus: "scouting" },
  { name: "مزارع أخرى", match: /مزرعة اصدقاء|مزرعة آبل|احدى المزارع|مزرعة ياسر|مزرعة/, type: "EXT", permitStatus: "scouting" },
];

/** The unit a slugline's location belongs to. */
function unitFor(location: string): string {
  for (const g of LOCATION_GROUPS) if (g.match.test(location)) return g.name;
  return "مواقع متفرقة";
}

const usedUnits = new Set(scenes.map((s) => unitFor(s.location)));
const locations: ProductionLocation[] = LOCATION_GROUPS.filter((g) => usedUnits.has(g.name)).map(
  (g, i) => {
    const inUnit = scenes.filter((s) => unitFor(s.location) === g.name);
    return {
      id: `loc_${i + 1}`,
      name: g.name,
      aliases: [...new Set(inUnit.map((s) => s.location))].slice(0, 8),
      type: g.type,
      permitStatus: g.permitStatus,
      costPerDay: g.permitStatus === "locked" ? 3500 : 2500,
      notes: `${inUnit.length} ${inUnit.length === 1 ? "مشهد" : "مشهدًا"} في هذا الموقع.`,
      ...(g.permitStatus === "locked" ? { lockDate: dateOnly(-6) } : {}),
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
    const night = bucket.filter((s) => s.timeOfDay === "NIGHT").length > bucket.length / 2;
    shootDays.push({
      id: `day_${dayNumber}`,
      dayNumber,
      date: dateOnly(dayNumber + 6),
      location: unit,
      locations: [unit],
      estimatedHours: Math.min(12, Math.max(8, Math.round(pages * 2.5))),
      scenes: bucket.map((s) => s.id),
      callTime: night ? "16:00" : "06:30",
      wrapTime: night ? "04:00" : "18:30",
      banners: [{ type: "meal", label: night ? "عشاء" : "غداء" }],
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
// TASKS
// ------------------------------------------------------------
const task = (
  t: Omit<Task, "createdAt" | "updatedAt" | "computedDeadline"> & { computedDeadline: string }
): Task => ({ ...t, createdAt: iso(-8), updatedAt: iso(-1) });

const tasks: Task[] = [
  task({ id: "t_permit_farm", title: "تصريح تصوير مزرعة يدو", description: "تصريح البلدية للتصوير الليلي داخل المزرعة.", owner: "crew_pm", department: "production", deadlineRule: "shoot_day(1) - 3d", computedDeadline: dateOnly(4), status: "completed", priority: "critical" }),
  task({ id: "t_permit_mutawaa", title: "موافقة مالك بيت المطوعة", description: "التصوير في الحوش ليلاً — بانتظار الموافقة الخطية.", owner: "crew_pm", department: "production", deadlineRule: "shoot_day(1) - 1d", computedDeadline: dateOnly(6), status: "blocked", priority: "critical", notes: "المالك يطلب تعويضاً إضافياً عن الليالي." }),
  task({ id: "t_camera_prep", title: "تجهيز الكاميرا والعدسات", owner: "crew_dp", department: "camera", deadlineRule: "shoot_day(1) - 2d", computedDeadline: dateOnly(5), status: "in_progress", priority: "high" }),
  task({ id: "t_sauna_steam", title: "معالجة البخار في مشاهد الساونا", description: "اختبار مولد البخار مع العدسات — خطر التكاثف.", owner: "crew_dp", department: "camera", linkedScene: sceneId("2"), deadlineRule: "shoot_day(1) - 1d", computedDeadline: dateOnly(6), status: "not_started", priority: "high" }),
  task({ id: "t_naay", title: "توفير الناي (إكسسوار بطل)", description: "الناي يظهر في مشاهد مرشد وعلي — نسختان للاستمرارية.", owner: "crew_art", department: "art", linkedScene: sceneId("3"), deadlineRule: "shoot_day(2) - 2d", computedDeadline: dateOnly(6), status: "in_progress", priority: "medium" }),
  task({ id: "t_farm_dress", title: "تجهيز المزرعة بحالتيها (الحاضر والماضي)", description: "المشهد الأول يتطلب المزرعة مهجورة ثم مزدهرة — تنسيق الديكور والزراعة.", owner: "crew_art", department: "art", linkedScene: sceneId("1"), deadlineRule: "shoot_day(1) - 5d", computedDeadline: dateOnly(2), status: "in_progress", priority: "critical" }),
  task({ id: "t_desert_convoy", title: "ترتيب قافلة الصحراء", description: "مشاهد الصحراء عند الغروب — نافذة تصوير ضيقة.", owner: "crew_pm", department: "transport", deadlineRule: "shoot_day(1) + 10d", computedDeadline: dateOnly(18), status: "not_started", priority: "medium" }),
  task({ id: "t_cast_contracts", title: "عقود الممثلين والكومبارس", owner: "crew_acct", department: "cast", deadlineRule: "shoot_day(1) - 4d", computedDeadline: dateOnly(3), status: "review", priority: "high" }),
  task({ id: "t_post_bid", title: "عروض ما بعد الإنتاج (مونتاج + تصحيح ألوان + DCP)", owner: "crew_acct", department: "accounting", deadlineRule: "manual(" + dateOnly(20) + ")", computedDeadline: dateOnly(20), status: "not_started", priority: "low" }),
  task({ id: "t_meals", title: "تعاقد الإعاشة اليومية", owner: "crew_pa", department: "production", deadlineRule: "shoot_day(1) - 2d", computedDeadline: dateOnly(5), status: "not_started", priority: "medium" }),
];

// ------------------------------------------------------------
// ASSEMBLE
// ------------------------------------------------------------
const elementCount = scenes.reduce((s, sc) => s + sc.elements.length, 0);
const projectId = "proj_yadoo3";

const production = {
  id: "prod_yadoo3",
  title: "مزرعة يدو ٣",
  currency: parsedBudget.currency ?? "AED",
  budget: budgetTotal,
  totalShootDays: shootDays.length,
  currentShootDay: 0,
  plannedPagesPerDay: PAGES_PER_DAY,
  script: { totalPages: Math.round(totalPages * 10) / 10, totalScenes: scenes.length },
};

const notifications = [
  { id: "n_1", type: "task_overdue", title: "بيت المطوعة — الموافقة معلّقة", body: "المالك يطلب تعويضاً إضافياً عن الليالي؛ المهمة موقوفة.", createdAt: iso(-1), read: false, linkTo: "/tasks" },
  { id: "n_2", type: "schedule_change", title: `الجدول جاهز — ${shootDays.length} يوم تصوير`, body: `${scenes.length} مشهدًا موزّعة على ${locations.length} موقعًا.`, createdAt: iso(-2), read: true, linkTo: "/schedule" },
  { id: "n_3", type: "ai_digest", title: "الملخص اليومي جاهز", body: "الميزانية مستوردة من ملف الإنتاج · موقع واحد متوقف على تصريح.", createdAt: iso(0, 8), read: false, linkTo: "/dashboard" },
];

const activityLog = [
  { id: "a_1", at: iso(-9), userId: "user_admin", userLabel: "Administrator", action: "created", entity: "project", entityId: projectId, description: "أنشأ مشروع مزرعة يدو ٣" },
  { id: "a_2", at: iso(-9, 11), userId: "user_admin", userLabel: "Administrator", action: "imported", entity: "scene", description: `استورد السيناريو — ${scenes.length} مشهدًا` },
  { id: "a_3", at: iso(-8), userId: "crew_acct", userLabel: "المحاسب", action: "imported", entity: "budget", description: `استورد ملف الميزانية — ${budgetLines.length} بندًا بقيمة ${budgetTotal.toLocaleString()} درهم` },
  { id: "a_4", at: iso(-6), userId: "crew_pm", userLabel: "مدير إدارة الإنتاج", action: "updated", entity: "location", entityId: "loc_1", description: "ثبّت موقع مزرعة يدو" },
  { id: "a_5", at: iso(-1), userId: "crew_pm", userLabel: "مدير إدارة الإنتاج", action: "status_change", entity: "task", entityId: "t_permit_mutawaa", description: "أوقف مهمة موافقة بيت المطوعة" },
];

const healthHistory = Array.from({ length: 10 }).map((_, i) => ({
  date: dateOnly(-9 + i),
  health: [52, 55, 58, 57, 62, 65, 64, 68, 70, 73][i],
}));

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
  aiDigest: {
    at: iso(0, 8),
    text:
      `الميزانية مستوردة من ملف الإنتاج: ${budgetLines.length} بندًا بقيمة ${budgetTotal.toLocaleString()} درهم، ` +
      `منها ثلاثة بنود (الكاميرا، الإضاءة، الكرين) لم تكن تحمل مبالغ في الملف الأصلي وتم استكمالها. ` +
      `السيناريو ${scenes.length} مشهدًا على ${Math.round(totalPages)} صفحة، موزّعة على ${shootDays.length} يوم تصوير في ${locations.length} موقعًا. ` +
      `العائق الحالي هو موافقة مالك بيت المطوعة — وهي على المسار الحرج لمشاهد الليل.`,
    hash: "yadoo3",
    model: "demo",
  },
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

// sha256("1234")
const users = [
  { id: "user_admin", username: "Admin", displayName: "Administrator", password: "sha256$03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4", roleId: "admin", active: true, createdAt: iso(-30) },
  { id: "user_pm", username: "pm", displayName: "مدير إدارة الإنتاج", password: "", roleId: "scheduler", active: true, createdAt: iso(-10), inviteCode: "YAD1PM01" },
  { id: "user_acct", username: "acct", displayName: "المحاسب", password: "", roleId: "accountant", active: true, createdAt: iso(-10), inviteCode: "YAD2ACC1" },
];

const project = {
  id: projectId,
  name: production.title,
  logline:
    "أصدقاء العمر يعودون إلى مزرعة يدو بعد سنوات، بين حاضرٍ مهجور وماضٍ مزدهر — تأليف أحمد زين الهاشمي، سيناريو وحوار أحمد خاطر.",
  createdAt: iso(-9),
  updatedAt: iso(0),
  currency: production.currency,
  script: {
    fileName: "مزرعة يدو — النسخة النهائية.pdf",
    rawText: readFileSync(SCRIPT_TXT, "utf8"),
    uploadedAt: iso(-9),
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
  aiUsage: [
    { id: "u_1", feature: "character_bible", at: iso(-9), inputTokens: 26400, outputTokens: 2100, model: "demo", costUsd: 0 },
  ],
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
    `(file stated ${parsedBudget.declaredTotal?.toLocaleString() ?? "—"})`
);
