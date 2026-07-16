import type { ProductionData } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";

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
  | "budget"
  | "tasks";

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
            cleanCell(day.location),
            cleanCell(day.estimatedHours),
            cleanCell(day.callTime),
            cleanCell(day.wrapTime),
            cleanCell(day.scenes.map((id) => nums[id] ?? id).join(", ")),
          ]),
      };
    },
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
];

export const getReport = (id: ReportId): ReportDef | undefined =>
  REPORTS.find((r) => r.id === id);

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

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

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
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `${slug(d.production.title || "project")}-${def.id}-${stamp}.csv`;
  triggerDownload(name, csv, "text/csv;charset=utf-8");
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

export function printReport(def: ReportDef, d: ProductionData) {
  const table = def.build(d);
  const title = d.production.title || "Production";
  const generated = new Date().toLocaleString();
  const head = table.columns.map((c) => `<th>${escapeHTML(c)}</th>`).join("");
  const body = table.rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHTML(cell)}</td>`).join("")}</tr>`
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHTML(
    title
  )} — ${escapeHTML(def.title)}</title><style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 32px; }
    header { border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
    h1 { font-size: 18px; margin: 0; }
    h2 { font-size: 14px; font-weight: 600; margin: 4px 0 0; color: #555; }
    .meta { font-size: 11px; color: #888; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #ccc; padding: 5px 7px; text-align: left; vertical-align: top; }
    th { background: #f2f2f2; font-weight: 600; }
    tr:nth-child(even) td { background: #fafafa; }
    footer { margin-top: 20px; font-size: 10px; color: #aaa; }
    @media print { body { margin: 12mm; } }
  </style></head><body>
    <header>
      <h1>${escapeHTML(title)}</h1>
      <h2>${escapeHTML(def.title)}</h2>
      <div class="meta">${table.rows.length} rows · Generated ${escapeHTML(
    generated
  )}</div>
    </header>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <footer>SceneTrackable · Built by OverExposure Productions</footer>
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
