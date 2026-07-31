import type { ProductionData, Scene, ShootDay } from "@/types";
import type { ReportTable } from "@/lib/reports";
import { tableToCSV, triggerDownload } from "@/lib/reports";
import { dayLocations } from "@/lib/locations";
import { addDaysIso } from "@/lib/utils";

// ============================================================
// SCHEDULE EXPORTS — the two documents a production actually circulates
// ============================================================
// Modelled on the two sheets this production works from:
//
//   1. «الجدول الزمني» — the LOCATION SCHEDULE. One row per *run of consecutive
//      days at one location*, with start/end dates, day count, unit sizes, the
//      map link, and which scenes the block covers. This is the document a
//      location manager and a line producer read.
//   2. «الجدول الزمني العام» — the GENERAL CALENDAR. One row per *calendar day*
//      across the whole production, pre-production through post, saying what
//      happens that day. This is the document everyone else reads.
//
// Both are built from the same store data the strip board is built from, so
// they can never drift from the board. Headers are bilingual (Arabic first,
// matching the source sheets) because that is how the sheets are circulated.
//
// The same "never invent a figure" rule the budget importer follows applies
// here: a count the store cannot measure renders as "—", never as a plausible
// number. Crew size is the *real* crew list length; cast count is the distinct
// cast actually cast into that block's scenes.

const DASH = "—";

/** Scene lookup by id, built once per export. */
function sceneIndex(d: ProductionData): Map<string, Scene> {
  return new Map(d.scenes.map((s) => [s.id, s]));
}

/** Day/Night label for a set of scenes, collapsed the way the source sheet writes it. */
function dayNightLabel(scenes: Scene[]): string {
  if (scenes.length === 0) return DASH;
  const hasDay = scenes.some((s) => s.timeOfDay === "DAY" || s.timeOfDay === "DAWN");
  const hasNight = scenes.some((s) => s.timeOfDay === "NIGHT" || s.timeOfDay === "DUSK");
  if (hasDay && hasNight) return "D + N";
  if (hasNight) return "Night";
  if (hasDay) return "Day";
  return DASH;
}

/** INT/EXT label for a set of scenes, collapsed the way the source sheet writes it. */
function intExtLabel(scenes: Scene[]): string {
  if (scenes.length === 0) return DASH;
  const hasInt = scenes.some((s) => s.intExt === "INT" || s.intExt === "INT/EXT");
  const hasExt = scenes.some((s) => s.intExt === "EXT" || s.intExt === "INT/EXT");
  if (hasInt && hasExt) return "INT+EXT";
  if (hasExt) return "EXT";
  if (hasInt) return "INT";
  return DASH;
}

/** Distinct cast cast into any of these scenes — measured, not estimated. */
function castCountFor(d: ProductionData, sceneIds: Set<string>): number {
  let n = 0;
  for (const member of d.cast) {
    if (member.scenes.some((sid) => sceneIds.has(sid))) n += 1;
  }
  return n;
}

/** Compact scene-number list: "1-4, 9, 12-14". */
function sceneRangeLabel(scenes: Scene[]): string {
  const nums = scenes
    .map((s) => ({ raw: s.number, n: parseInt(s.number, 10) }))
    .filter((x) => Number.isFinite(x.n))
    .sort((a, b) => a.n - b.n);
  if (nums.length === 0) return scenes.map((s) => s.number).join(", ");
  const parts: string[] = [];
  let start = nums[0].n;
  let prev = nums[0].n;
  for (let i = 1; i <= nums.length; i++) {
    const cur = i < nums.length ? nums[i].n : NaN;
    if (cur !== prev + 1) {
      parts.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = cur;
    }
    prev = cur;
  }
  return parts.join(", ");
}

const fmtDate = (iso: string): string => {
  if (!iso) return DASH;
  const d = new Date(iso.slice(0, 10) + "T00:00:00.000Z");
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayOf = (iso: string): string => {
  const d = new Date(iso.slice(0, 10) + "T00:00:00.000Z");
  return Number.isNaN(d.getTime()) ? "" : WEEKDAYS[d.getUTCDay()];
};

// ------------------------------------------------------------
// 1. LOCATION SCHEDULE — «الجدول الزمني»
// ------------------------------------------------------------

interface LocationBlock {
  location: string;
  days: ShootDay[];
  scenes: Scene[];
}

/**
 * Groups the board into runs of *consecutive* shoot days sharing a primary
 * location. Consecutive matters: the source sheet's «عدد الايام» is the length
 * of an unbroken stay at one place, so a location revisited later in the
 * schedule is correctly a second row, not a bigger first row.
 */
export function locationBlocks(d: ProductionData): LocationBlock[] {
  const idx = sceneIndex(d);
  const days = [...d.shootDays].sort((a, b) => a.dayNumber - b.dayNumber);
  const blocks: LocationBlock[] = [];
  for (const day of days) {
    const key = dayLocations(day).join(" + ") || DASH;
    const scenes = day.scenes.map((sid) => idx.get(sid)).filter((s): s is Scene => !!s);
    const last = blocks[blocks.length - 1];
    if (last && last.location === key) {
      last.days.push(day);
      last.scenes.push(...scenes);
    } else {
      blocks.push({ location: key, days: [day], scenes });
    }
  }
  return blocks;
}

export function buildLocationScheduleTable(d: ProductionData): ReportTable {
  const blocks = locationBlocks(d);
  const crewSize = d.crew.length;
  return {
    columns: [
      "الموقع حسب النص / Location (script)",
      "المكان / Place",
      "العملية / Operation",
      "تاريخ البدء / Start",
      "تاريخ الانتهاء / End",
      "رابط الموقع / Location Link",
      "عدد الأيام / Days",
      "الطاقم الفني / Crew",
      "عدد الممثلين / Cast",
      "وصف تفصيلي / Description",
      "Day / Night",
      "INT/EXT",
    ],
    rows: blocks.map((b) => {
      const rec = d.locations.find(
        (l) => l.name === b.location || (l.aliases ?? []).includes(b.location)
      );
      const sceneIds = new Set(b.scenes.map((s) => s.id));
      const cast = castCountFor(d, sceneIds);
      const synopses = b.scenes
        .map((s) => s.synopsis)
        .filter(Boolean)
        .join(" / ");
      const range = sceneRangeLabel(b.scenes);
      const description = [range ? `مشاهد ${range}` : "", synopses]
        .filter(Boolean)
        .join(" — ");
      return [
        b.location,
        rec?.address || DASH,
        "تصوير",
        fmtDate(b.days[0].date),
        fmtDate(b.days[b.days.length - 1].date),
        rec?.mapUrl || rec?.address || DASH,
        String(b.days.length),
        crewSize > 0 ? String(crewSize) : DASH,
        cast > 0 ? String(cast) : DASH,
        description || DASH,
        dayNightLabel(b.scenes),
        intExtLabel(b.scenes),
      ];
    }),
  };
}

/** The summary block the source sheet carries under the table. */
export function locationScheduleSummary(d: ProductionData): [string, string][] {
  const days = [...d.shootDays].sort((a, b) => a.dayNumber - b.dayNumber);
  const p = d.production;
  return [
    ["تاريخ بدء التصوير / First day of shooting", fmtDate(p.principalPhotographyStart || days[0]?.date || "")],
    ["تاريخ انتهاء التصوير / Last day of shooting", fmtDate(p.principalPhotographyEnd || days[days.length - 1]?.date || "")],
    ["عدد أيام التصوير / Number of shooting days", days.length ? String(days.length) : DASH],
    ["بداية التحضير / Pre-production start", fmtDate(p.preProductionStart || "")],
    ["بداية ما بعد الإنتاج / Post-production start", fmtDate(p.postProductionStart || "")],
    ["نهاية ما بعد الإنتاج / Post-production end", fmtDate(p.postProductionEnd || "")],
  ];
}

// ------------------------------------------------------------
// 2. GENERAL CALENDAR — «الجدول الزمني العام»
// ------------------------------------------------------------

/**
 * The calendar's window. Starts at the earliest known boundary and ends at the
 * latest, so a production that has only filled in some of the timeline still
 * gets a usable document instead of an empty one.
 */
function calendarWindow(d: ProductionData): { from: string; to: string } | null {
  const days = [...d.shootDays].sort((a, b) => a.dayNumber - b.dayNumber);
  const p = d.production;
  const starts = [p.preProductionStart, p.principalPhotographyStart, days[0]?.date].filter(
    (x): x is string => !!x
  );
  const ends = [
    p.postProductionEnd,
    p.postProductionStart,
    p.principalPhotographyEnd,
    days[days.length - 1]?.date,
  ].filter((x): x is string => !!x);
  if (starts.length === 0 || ends.length === 0) return null;
  const from = starts.map((s) => s.slice(0, 10)).sort()[0];
  const to = ends.map((s) => s.slice(0, 10)).sort().reverse()[0];
  return from <= to ? { from, to } : null;
}

export function buildGeneralCalendarTable(d: ProductionData): ReportTable {
  const win = calendarWindow(d);
  const columns = [
    "التاريخ / Date",
    "اليوم / Day",
    "العملية / Operation",
    "الموقع / Location",
    "وصف / Description",
    "ملاحظات / Notes",
  ];
  if (!win) return { columns, rows: [] };

  const idx = sceneIndex(d);
  const byDate = new Map<string, ShootDay>();
  for (const day of d.shootDays) byDate.set(day.date.slice(0, 10), day);

  const p = d.production;
  const preStart = p.preProductionStart?.slice(0, 10);
  const ppStart = p.principalPhotographyStart?.slice(0, 10);
  const ppEnd = p.principalPhotographyEnd?.slice(0, 10);
  const postStart = p.postProductionStart?.slice(0, 10);
  const postEnd = p.postProductionEnd?.slice(0, 10);

  const rows: string[][] = [];
  for (let date = win.from; date <= win.to; date = addDaysIso(date, 1)) {
    const shoot = byDate.get(date);
    // Post can legitimately overlap the shoot (editing starts on dailies), so
    // these are independent tests, not an if/else chain — a day can be both.
    const inPost = !!postStart && date >= postStart && (!postEnd || date <= postEnd);
    const inPre =
      !!preStart && date >= preStart && (!ppStart || date < ppStart);
    const inShootWindow =
      !!ppStart && date >= ppStart && (!ppEnd || date <= ppEnd);

    const ops: string[] = [];
    if (shoot) ops.push(`تصوير / Shoot — يوم ${shoot.dayNumber}`);
    if (inPost) ops.push("مونتاج / Post");
    if (!shoot && inPre) ops.push("تحضير / Prep");
    if (!shoot && !inPre && !inPost && inShootWindow) ops.push("راحة / Off Day");
    if (ops.length === 0) ops.push("راحة / Off Day");

    const scenes = shoot
      ? shoot.scenes.map((sid) => idx.get(sid)).filter((s): s is Scene => !!s)
      : [];
    const range = scenes.length ? sceneRangeLabel(scenes) : "";
    const locs = shoot ? dayLocations(shoot).join(" + ") : "";

    rows.push([
      fmtDate(date),
      weekdayOf(date),
      ops.join(" + "),
      locs || DASH,
      range ? `مشاهد ${range}` : DASH,
      shoot
        ? `${scenes.length} مشهد · ${dayNightLabel(scenes)} · ${intExtLabel(scenes)}`
        : DASH,
    ]);
  }
  return { columns, rows };
}

// ------------------------------------------------------------
// Output paths
// ------------------------------------------------------------

export type ScheduleExportId = "location_schedule" | "general_calendar";

export interface ScheduleExportDef {
  id: ScheduleExportId;
  title: string;
  arabicTitle: string;
  description: string;
  build: (d: ProductionData) => ReportTable;
  summary?: (d: ProductionData) => [string, string][];
}

export const SCHEDULE_EXPORTS: ScheduleExportDef[] = [
  {
    id: "location_schedule",
    title: "Location Schedule",
    arabicTitle: "الجدول الزمني",
    description:
      "One row per run of consecutive days at a location — dates, day count, unit size, map link, scenes.",
    build: buildLocationScheduleTable,
    summary: locationScheduleSummary,
  },
  {
    id: "general_calendar",
    title: "General Calendar",
    arabicTitle: "الجدول الزمني العام",
    description:
      "One row per calendar day across the whole production — prep, shoot, post and off days.",
    build: buildGeneralCalendarTable,
  },
];

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function exportScheduleCSV(def: ScheduleExportDef, d: ProductionData) {
  const table = def.build(d);
  const rows = def.summary
    ? {
        columns: table.columns,
        rows: [
          ...table.rows,
          new Array(table.columns.length).fill(""),
          ...def.summary(d).map((pair) => {
            const row = new Array(table.columns.length).fill("");
            row[0] = pair[0];
            row[1] = pair[1];
            return row;
          }),
        ],
      }
    : table;
  const stamp = new Date().toISOString().slice(0, 10);
  triggerDownload(
    `${slug(d.production.title || "project")}-${slug(def.id)}-${stamp}.csv`,
    tableToCSV(rows),
    "text/csv;charset=utf-8"
  );
}

const escapeHTML = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Opens a print-ready RTL document (→ "Save as PDF").
 *
 * Deliberately *not* `lib/pdfExport.ts`'s jsPDF path: jsPDF ships no Arabic
 * glyphs and does no Arabic shaping or bidi reordering, so an Arabic schedule
 * comes out of it as disconnected letters in reverse order. The browser's own
 * print engine shapes and orders Arabic correctly and keeps the text
 * selectable, which for these two documents matters more than skipping the
 * print dialog. `buildTablePdf` remains the right path for Latin tables.
 */
export function printScheduleDocument(def: ScheduleExportDef, d: ProductionData) {
  const table = def.build(d);
  const title = d.production.title || "Production";
  const generated = new Date().toLocaleString();
  const head = table.columns.map((c) => `<th>${escapeHTML(c)}</th>`).join("");
  const body = table.rows
    .map((row) => `<tr>${row.map((c) => `<td>${escapeHTML(c)}</td>`).join("")}</tr>`)
    .join("");
  const summary = def.summary
    ? `<table class="summary"><tbody>${def
        .summary(d)
        .map(
          (pair) =>
            `<tr><th>${escapeHTML(pair[0])}</th><td>${escapeHTML(pair[1])}</td></tr>`
        )
        .join("")}</tbody></table>`
    : "";

  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${escapeHTML(
    title
  )} — ${escapeHTML(def.arabicTitle)}</title><style>
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", Tahoma, "Noto Naskh Arabic", Arial, sans-serif; color: #111; margin: 24px; }
    header { border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
    h1 { font-size: 18px; margin: 0; }
    h2 { font-size: 14px; font-weight: 600; margin: 4px 0 0; color: #555; }
    .meta { font-size: 11px; color: #888; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; table-layout: fixed; }
    th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: right; vertical-align: top; word-wrap: break-word; }
    th { background: #f2f2f2; font-weight: 600; font-size: 9px; }
    tr:nth-child(even) td { background: #fafafa; }
    table.summary { width: auto; margin-top: 18px; font-size: 11px; }
    table.summary th { text-align: right; background: #f2f2f2; }
    footer { margin-top: 20px; font-size: 10px; color: #aaa; }
    @page { size: A4 landscape; margin: 10mm; }
    @media print { body { margin: 0; } }
  </style></head><body>
    <header>
      <h1>${escapeHTML(title)}</h1>
      <h2>${escapeHTML(def.arabicTitle)} · ${escapeHTML(def.title)}</h2>
      <div class="meta">${table.rows.length} صفًا · ${escapeHTML(generated)}</div>
    </header>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    ${summary}
    <footer>SceneTrackable · Built by OverExposure Productions</footer>
    <script>window.onload = function () { window.print(); };<\/script>
  </body></html>`;

  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
