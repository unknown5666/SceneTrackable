import type { ProductionData } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { scenesAtLocation, dayLocations } from "@/lib/locations";

// ============================================================
// REPORTS — build tabular exports from a production dataset
// ============================================================

export interface ReportTable {
  columns: string[];
  rows: string[][];
}

export type ReportId =
  | "scenes"
  | "elements"
  | "cast"
  | "dood"
  | "schedule"
  | "locations"
  | "budget"
  | "tasks"
  | "drones";

export interface ReportDef {
  id: ReportId;
  title: string;
  description: string;
  /** True when the active project has no data for this report. */
  isEmpty: (d: ProductionData) => boolean;
  build: (d: ProductionData) => ReportTable;
}

const cleanCell = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim();

/** Map scene IDs -> human scene numbers. */
function sceneNumberMap(d: ProductionData): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of d.scenes) map[s.id] = s.number;
  return map;
}

function crewName(d: ProductionData, id: string): string {
  return d.crew.find((c) => c.id === id)?.name ?? id;
}

// ------------------------------------------------------------
// Report definitions
// ------------------------------------------------------------

export const REPORTS: ReportDef[] = [
  {
    id: "scenes",
    title: "Scene Breakdown",
    description:
      "Every scene with heading, page count, estimated time, and element count.",
    isEmpty: (d) => d.scenes.length === 0,
    build: (d) => ({
      columns: [
        "Scene",
        "INT/EXT",
        "Location",
        "Time",
        "Pages (1/8)",
        "Est. Min",
        "Elements",
        "VFX",
        "SFX",
        "Synopsis",
      ],
      rows: d.scenes.map((s) => [
        cleanCell(s.number),
        cleanCell(s.intExt),
        cleanCell(s.location),
        cleanCell(s.timeOfDay),
        cleanCell(s.pages),
        cleanCell(s.estimatedShootMinutes),
        cleanCell(s.elements.length),
        s.vfxFlags ? "Yes" : "",
        s.sfxFlags ? "Yes" : "",
        cleanCell(s.synopsis),
      ]),
    }),
  },
  {
    id: "elements",
    title: "Element List",
    description:
      "One row per breakdown element across all scenes — props, cast, wardrobe, SFX, VFX and more.",
    isEmpty: (d) => d.scenes.every((s) => s.elements.length === 0),
    build: (d) => {
      const rows: string[][] = [];
      for (const s of d.scenes) {
        for (const el of s.elements) {
          rows.push([
            cleanCell(s.number),
            cleanCell(el.category),
            cleanCell(el.subCategory),
            cleanCell(el.name),
            cleanCell(el.linkedDepartment),
            cleanCell(el.description),
            cleanCell(el.notes),
          ]);
        }
      }
      return {
        columns: [
          "Scene",
          "Category",
          "Sub-Category",
          "Name",
          "Department",
          "Description",
          "Notes",
        ],
        rows,
      };
    },
  },
  {
    id: "cast",
    title: "Cast List",
    description: "Cast members, characters, day rates, and scene counts.",
    isEmpty: (d) => d.cast.length === 0,
    build: (d) => ({
      columns: [
        "Name",
        "Character",
        "Category",
        "Scenes",
        "Rate/Day",
        "Agent",
        "Contact",
      ],
      rows: d.cast.map((c) => [
        cleanCell(c.name),
        cleanCell(c.role),
        cleanCell(c.category.replace("_", " ")),
        cleanCell(c.scenes.length),
        formatCurrency(c.ratePerDay, d.production.currency),
        cleanCell(c.agent),
        cleanCell(c.contact),
      ]),
    }),
  },
  {
    id: "dood",
    title: "Day Out of Days (DOOD)",
    description:
      "Cast working status per shoot day — W, H, SW, WF, SWF, T — the standard AD scheduling grid.",
    isEmpty: (d) => d.cast.length === 0 || (d.shootDays.length === 0 && Object.keys(d.dood).length === 0),
    build: (d) => {
      const maxDoodDay = Object.values(d.dood).reduce(
        (m, days) => Math.max(m, ...Object.keys(days).map(Number)),
        0
      );
      const totalDays = Math.max(
        d.production.totalShootDays,
        d.shootDays.reduce((m, day) => Math.max(m, day.dayNumber), 0),
        maxDoodDay
      );
      const dayNums = Array.from({ length: totalDays }, (_, i) => i + 1);
      return {
        columns: ["Cast", "Character", ...dayNums.map((n) => `Day ${n}`)],
        rows: d.cast.map((c) => [
          cleanCell(c.name),
          cleanCell(c.role),
          ...dayNums.map((n) => {
            const status = d.dood[c.id]?.[n];
            return status && status !== "OFF" ? status : "";
          }),
        ]),
      };
    },
  },
  {
    id: "schedule",
    title: "Shooting Schedule",
    description: "Shoot days with dates, locations, call/wrap times, and scenes.",
    isEmpty: (d) => d.shootDays.length === 0,
    build: (d) => {
      const nums = sceneNumberMap(d);
      return {
        columns: [
          "Day",
          "Date",
          "Location",
          "Est. Hours",
          "Call",
          "Wrap",
          "Scenes",
        ],
        rows: [...d.shootDays]
          .sort((a, b) => a.dayNumber - b.dayNumber)
          .map((day) => [
            cleanCell(day.dayNumber),
            day.date ? formatDate(day.date, { year: "numeric" }) : "",
            cleanCell(dayLocations(day).join(" → ")),
            cleanCell(day.estimatedHours),
            cleanCell(day.callTime),
            cleanCell(day.wrapTime),
            cleanCell(day.scenes.map((id) => nums[id] ?? id).join(", ")),
          ]),
      };
    },
  },
  {
    id: "locations",
    title: "Location Report",
    description:
      "Every location with permit status, lock date, the scenes that play there, and shoot days.",
    isEmpty: (d) => d.locations.length === 0,
    build: (d) => ({
      columns: [
        "Location",
        "Type",
        "Permit Status",
        "Lock Date",
        "Scene Count",
        "Scenes",
        "Shoot Days",
        "Cost/Day",
        "Address",
        "Contact",
      ],
      rows: [...d.locations]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((loc) => {
          const at = scenesAtLocation(d.scenes, loc);
          const sceneIds = new Set(at.map((s) => s.id));
          const days = d.shootDays
            .filter((day) => day.scenes.some((id) => sceneIds.has(id)))
            .map((day) => day.dayNumber)
            .sort((a, b) => a - b);
          return [
            cleanCell(loc.name),
            cleanCell(loc.type),
            cleanCell(loc.permitStatus.replace(/_/g, " ")),
            loc.lockDate ? formatDate(loc.lockDate, { year: "numeric" }) : "",
            cleanCell(at.length),
            cleanCell(at.map((s) => s.number).join(", ")),
            cleanCell(days.join(", ")),
            loc.costPerDay === undefined
              ? ""
              : formatCurrency(loc.costPerDay, d.production.currency),
            cleanCell(loc.address),
            cleanCell([loc.contactName, loc.contactPhone].filter(Boolean).join(" · ")),
          ];
        }),
    }),
  },
  {
    id: "budget",
    title: "Budget Top Sheet",
    description:
      "Budget lines by account with budgeted, committed, spent, and remaining.",
    isEmpty: (d) => d.budgetLines.length === 0,
    build: (d) => {
      const cur = d.production.currency;
      const rows: string[][] = d.budgetLines.map((l) => [
        cleanCell(l.code),
        cleanCell(l.category),
        cleanCell(l.description),
        formatCurrency(l.budgeted, cur),
        formatCurrency(l.committed, cur),
        formatCurrency(l.spent, cur),
        formatCurrency(l.budgeted - l.spent, cur),
      ]);
      const tB = d.budgetLines.reduce((s, l) => s + l.budgeted, 0);
      const tC = d.budgetLines.reduce((s, l) => s + l.committed, 0);
      const tS = d.budgetLines.reduce((s, l) => s + l.spent, 0);
      rows.push([
        "",
        "TOTAL",
        "",
        formatCurrency(tB, cur),
        formatCurrency(tC, cur),
        formatCurrency(tS, cur),
        formatCurrency(tB - tS, cur),
      ]);
      return {
        columns: [
          "Code",
          "Category",
          "Description",
          "Budgeted",
          "Committed",
          "Spent",
          "Remaining",
        ],
        rows,
      };
    },
  },
  {
    id: "tasks",
    title: "Task List",
    description: "Production tasks with owner, department, status, and deadlines.",
    isEmpty: (d) => d.tasks.length === 0,
    build: (d) => {
      const nums = sceneNumberMap(d);
      return {
        columns: [
          "Title",
          "Department",
          "Owner",
          "Status",
          "Priority",
          "Deadline",
          "Linked Scene",
        ],
        rows: d.tasks.map((t) => [
          cleanCell(t.title),
          cleanCell(t.department),
          crewName(d, t.owner),
          cleanCell(t.status.replace("_", " ")),
          cleanCell(t.priority),
          t.computedDeadline ? formatDate(t.computedDeadline, { year: "numeric" }) : "",
          cleanCell(t.linkedScene ? nums[t.linkedScene] ?? t.linkedScene : ""),
        ]),
      };
    },
  },
  {
    id: "drones",
    title: "Aerial / Drones",
    description: "Every drone with operator, licence, day rates, registration, and booked day.",
    isEmpty: (d) => d.drones.length === 0,
    build: (d) => ({
      columns: [
        "Manufacturer",
        "Model",
        "Serial",
        "Weight (g)",
        "Registration",
        "Operator",
        "Licence",
        "Operator Rate/Day",
        "Drone Rate/Day",
        "Status",
        "Booked Day",
      ],
      rows: d.drones.map((dr) => [
        cleanCell(dr.manufacturer),
        cleanCell(dr.model),
        cleanCell(dr.serial),
        cleanCell(dr.weightGrams),
        cleanCell((dr.regStatus ?? "").replace(/_/g, " ")),
        cleanCell(dr.operatorName),
        cleanCell(dr.operatorLicense),
        dr.operatorRatePerDay === undefined
          ? ""
          : formatCurrency(dr.operatorRatePerDay, d.production.currency),
        dr.droneRatePerDay === undefined
          ? ""
          : formatCurrency(dr.droneRatePerDay, d.production.currency),
        cleanCell(dr.status),
        dr.assignedShootDay ? `Day ${dr.assignedShootDay}` : "",
      ]),
    }),
  },
];

export const getReport = (id: ReportId): ReportDef | undefined =>
  REPORTS.find((r) => r.id === id);

// ------------------------------------------------------------
// Branding, colour coding and file naming
//
// Shared by EVERY export path (CSV, the print-to-PDF windows and the jsPDF
// builders in lib/pdfExport.ts) so a document looks the same and is named the
// same wherever it was generated from. These live here, not in pdfExport.ts,
// because reports.ts is the module with no dependencies — pdfExport imports
// from here, never the other way round.
// ------------------------------------------------------------

/** Required on the bottom of every document this application generates. */
export const BRAND_FOOTER =
  "Made with Over Magic powered by Over Exposure Productions";

/** Human-readable key for the cell tinting below — printed under every table. */
export const COLOR_KEY =
  "Colour key — green: done / confirmed · amber: pending / in progress · red: problem / not done · blue: informational";

/**
 * Accent colour per document kind. The header band, the rule under the title
 * and the table head all use it, so you can tell a budget sheet from a
 * schedule from across the room.
 */
const ACCENTS: Record<string, string> = {
  scene: "#4f46e5",
  element: "#7c3aed",
  cast: "#db2777",
  dood: "#be123c",
  wardrobe: "#7c3aed",
  art: "#7c3aed",
  schedule: "#0d9488",
  calendar: "#0284c7",
  location: "#16a34a",
  budget: "#b45309",
  invoice: "#b45309",
  task: "#2563eb",
  drone: "#475569",
  camera: "#475569",
  call: "#0f766e",
  breakdown: "#4f46e5",
};

/** Accent for a report id, document id or free-form kind ("scene-12A"). */
export function accentHex(kind: string): string {
  const k = kind.toLowerCase();
  for (const key of Object.keys(ACCENTS)) if (k.includes(key)) return ACCENTS[key];
  return "#1f2937";
}

export type StatusTone = "good" | "warn" | "bad" | "info" | null;

const TONE_WORDS: { tone: Exclude<StatusTone, null>; re: RegExp }[] = [
  {
    tone: "good",
    re: /^(yes|shot|done|complete|completed|confirmed|approved|secured|locked|paid|reconciled|active|available|delivered|w|sw|wf|swf)$/i,
  },
  {
    tone: "warn",
    re: /^(pending|in progress|processing|on hold|hold|h|draft|requested|partial|uploaded|prep|tentative|not shot|todo|scouting)$/i,
  },
  {
    tone: "bad",
    re: /^(no|overdue|blocked|error|rejected|denied|cancelled|canceled|unavailable|missing|urgent|critical|high)$/i,
  },
  { tone: "info", re: /^(shoot|off day|travel|t|post|day|night|d \+ n|int|ext|int\+ext)$/i },
];

/** Tone for one cell value — drives the background tint in every export. */
export function statusTone(value: string): StatusTone {
  const v = value.trim();
  if (!v || v.length > 24) return null;
  for (const t of TONE_WORDS) if (t.re.test(v)) return t.tone;
  return null;
}

export const TONE_CSS: Record<Exclude<StatusTone, null>, { bg: string; fg: string }> = {
  good: { bg: "#dcfce7", fg: "#166534" },
  warn: { bg: "#fef3c7", fg: "#92400e" },
  bad: { bg: "#fee2e2", fg: "#991b1b" },
  info: { bg: "#e0f2fe", fg: "#075985" },
};

/**
 * ASCII, title-cased name part. An Arabic (or any non-Latin) project title
 * would otherwise slug down to an empty string and produce files called
 * "-schedule-2026-01-01.csv"; every exported file is named in English.
 */
function asciiName(s: string): string {
  return (s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("-");
}

/** `Sample-Film_Scene-Breakdown_2026-07-31.pdf` — always English, always dated. */
export function exportFilename(projectTitle: string, kind: string, ext: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${asciiName(projectTitle) || "Production"}_${asciiName(kind) || "Export"}_${stamp}.${ext}`;
}

// ------------------------------------------------------------
// CSV serialization + download
// ------------------------------------------------------------

function escapeCSV(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function tableToCSV(table: ReportTable): string {
  const lines = [table.columns, ...table.rows].map((row) =>
    row.map((cell) => escapeCSV(cell)).join(",")
  );
  // Prepend BOM so Excel detects UTF-8.
  return "﻿" + lines.join("\r\n");
}

export function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportReportCSV(def: ReportDef, d: ProductionData) {
  const table = def.build(d);
  const csv = tableToCSV(table);
  triggerDownload(
    exportFilename(d.production.title, def.title, "csv"),
    csv,
    "text/csv;charset=utf-8"
  );
}

// ------------------------------------------------------------
// Print / Save-as-PDF (opens a clean printable document)
// ------------------------------------------------------------

const escapeHTML = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Tone class for a body cell — the shared colour coding, as a CSS class. */
export const toneClass = (cell: string): string => {
  const tone = statusTone(cell);
  return tone ? ` class="t-${tone}"` : "";
};

/** The `<style>` rules for tone tinting, shared by every print document. */
export const TONE_STYLE = (Object.keys(TONE_CSS) as Exclude<StatusTone, null>[])
  .map((t) => `td.t-${t} { background: ${TONE_CSS[t].bg} !important; color: ${TONE_CSS[t].fg}; font-weight: 600; }`)
  .join("\n    ");

export function printReport(def: ReportDef, d: ProductionData, narration?: string) {
  const table = def.build(d);
  const title = d.production.title || "Production";
  const accent = accentHex(def.id);
  const generated = new Date().toLocaleString();
  const head = table.columns.map((c) => `<th>${escapeHTML(c)}</th>`).join("");
  const body = table.rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell) => `<td${toneClass(cell)}>${escapeHTML(cell)}</td>`)
          .join("")}</tr>`
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHTML(
    title
  )} — ${escapeHTML(def.title)}</title><style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 32px; }
    header { border-bottom: 3px solid ${accent}; padding-bottom: 12px; margin-bottom: 16px; }
    h1 { font-size: 18px; margin: 0; }
    h2 { font-size: 14px; font-weight: 600; margin: 4px 0 0; color: ${accent}; }
    .meta { font-size: 11px; color: #888; margin-top: 6px; }
    .summary { font-size: 12px; line-height: 1.5; margin: 0 0 16px; padding: 10px 12px; background: #f7f7f9; border-left: 3px solid ${accent}; }
    .summary h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #666; margin: 0 0 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #9aa0a6; padding: 5px 7px; text-align: left; vertical-align: top; }
    th { background: ${accent}; color: #fff; font-weight: 700; border-color: ${accent}; }
    tbody tr:nth-child(even) td { background: #f4f5f7; }
    ${TONE_STYLE}
    .key { margin-top: 14px; font-size: 9px; color: #666; }
    footer { margin-top: 8px; font-size: 10px; color: #666; border-top: 1px solid #ddd; padding-top: 8px; }
    @media print {
      body { margin: 12mm; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
      th, td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style></head><body>
    <header>
      <h1>${escapeHTML(title)}</h1>
      <h2>${escapeHTML(def.title)}</h2>
      <div class="meta">${table.rows.length} rows · Generated ${escapeHTML(
    generated
  )}</div>
    </header>
    ${
      narration
        ? `<div class="summary"><h3>Summary</h3>${escapeHTML(narration)}</div>`
        : ""
    }
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <div class="key">${escapeHTML(COLOR_KEY)}</div>
    <footer>${escapeHTML(BRAND_FOOTER)}</footer>
  </body></html>`;

  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  // Give the new document a tick to lay out before invoking print.
  setTimeout(() => win.print(), 300);
  return true;
}
