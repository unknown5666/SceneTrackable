// ============================================================
// EXPORT — CSV downloads, printable breakdown sheets, and full
// workspace backup / restore (JSON of the persisted store).
// ============================================================

import type { ProductionData, Scene } from "@/types";
import { demoDigest, type ProposedCallSheet } from "@/lib/claude";
import { buildDigestInput } from "@/lib/metrics";

const STORE_KEY = "scenetrackable-v1";

function openPrintWindow(html: string, what: string): void {
  const w = window.open("", "_blank");
  if (!w) {
    alert(`Pop-up blocked. Allow pop-ups for this site to print ${what}.`);
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

// ------------------------------------------------------------
// Generic helpers
// ------------------------------------------------------------
export function csvCell(v: string | number | undefined | null): string {
  const s = v === undefined || v === null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV(rows: (string | number | undefined | null)[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export function downloadText(filename: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
}

function esc(s: string | undefined | null): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ------------------------------------------------------------
// Breakdown → CSV (one row per element)
// ------------------------------------------------------------
export function exportBreakdownCSV(projectName: string, scenes: Scene[]): void {
  const rows: (string | number)[][] = [
    ["Scene", "INT/EXT", "Location", "Time", "Pages", "Category", "Element", "Sub-category", "Description", "Notes"],
  ];
  for (const sc of scenes) {
    if (sc.elements.length === 0) {
      rows.push([sc.number, sc.intExt, sc.location, sc.timeOfDay, sc.pages, "", "", "", "", ""]);
      continue;
    }
    for (const el of sc.elements) {
      rows.push([
        sc.number,
        sc.intExt,
        sc.location,
        sc.timeOfDay,
        sc.pages,
        el.category,
        el.name,
        el.subCategory ?? "",
        el.description ?? "",
        el.notes ?? "",
      ]);
    }
  }
  downloadText(`${slug(projectName)}-breakdown.csv`, toCSV(rows), "text/csv");
}

// ------------------------------------------------------------
// Printable industry-style breakdown sheets (one page per scene)
// ------------------------------------------------------------
const SHEET_CATEGORIES: { key: string; label: string }[] = [
  { key: "cast", label: "Cast" },
  { key: "extras", label: "Extras / Atmosphere" },
  { key: "props", label: "Props" },
  { key: "wardrobe", label: "Wardrobe" },
  { key: "makeup", label: "Makeup / Hair" },
  { key: "sfx", label: "Special Effects" },
  { key: "vfx", label: "Visual Effects" },
  { key: "stunts", label: "Stunts" },
  { key: "vehicles", label: "Vehicles" },
  { key: "animals", label: "Animals" },
  { key: "locations", label: "Locations" },
  { key: "production", label: "Production Requirements" },
];

export function printBreakdownSheets(projectName: string, scenes: Scene[]): void {
  const printedOn = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const total = scenes.length;
  const pages = scenes
    .map((sc, i) => {
      const boxes = SHEET_CATEGORIES.map((cat) => {
        const els = sc.elements.filter((e) => e.category === cat.key);
        if (!els.length) return "";
        const items = els
          .map(
            (e) =>
              `<li><strong>${esc(e.name)}</strong>${e.subCategory ? ` <em>(${esc(e.subCategory)})</em>` : ""}${e.description ? ` — ${esc(e.description)}` : ""}</li>`
          )
          .join("");
        return `<div class="box"><h3>${cat.label}</h3><ul>${items}</ul></div>`;
      }).join("");
      return `
      <section class="sheet">
        <header>
          <div class="topline">
            <span class="prod">${esc(projectName)} — Breakdown Sheet</span>
            <span class="page">${printedOn} · Sheet ${i + 1} of ${total}</span>
          </div>
          <h2>Scene ${esc(sc.number)} · ${esc(sc.intExt)}. ${esc(sc.location)} — ${esc(sc.timeOfDay)}</h2>
          <div class="meta">${sc.pages} pages · est. ${sc.estimatedShootMinutes} min${sc.synopsis ? ` · ${esc(sc.synopsis)}` : ""}</div>
        </header>
        <div class="grid">${boxes || "<div class='box empty'>No elements recorded for this scene.</div>"}</div>
      </section>`;
    })
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(projectName)} — Breakdown Sheets</title>
  <style>
    /* Standalone print document — light theme is inherent (no app CSS vars). */
    * { box-sizing: border-box; margin: 0; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #111; background: #fff; }
    .sheet { page-break-after: always; padding: 28px 32px; }
    header { border-bottom: 3px double #111; padding-bottom: 10px; margin-bottom: 16px; }
    .topline { display: flex; justify-content: space-between; align-items: baseline; }
    .prod { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #555; }
    .page { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #888; }
    h2 { font-size: 19px; margin-top: 6px; }
    .meta { font-size: 12px; color: #444; margin-top: 4px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .box { border: 1px solid #999; padding: 8px 10px; break-inside: avoid; }
    .box h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 6px; }
    .box ul { list-style: none; font-size: 12px; line-height: 1.5; }
    .box.empty { grid-column: span 2; color: #777; font-size: 12px; border-style: dashed; }
    @media print { .sheet { padding: 0 0 24px; } }
  </style></head><body>${pages}</body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("Pop-up blocked. Allow pop-ups for this site to print breakdown sheets.");
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  // Give the new window a beat to layout before the print dialog.
  setTimeout(() => w.print(), 300);
}

// ------------------------------------------------------------
// Printable AI call sheet (one day)
// ------------------------------------------------------------
export interface CallSheetDayMeta {
  dayNumber: number;
  date: string;
  locations: string[];
  callTime?: string;
  wrapTime?: string;
  weather?: string;
}

export function printCallSheet(
  projectName: string,
  day: CallSheetDayMeta,
  sheet: ProposedCallSheet
): void {
  const sceneRows = sheet.scenes
    .map(
      (s) => `<tr><td class="num">${esc(s.number)}</td><td>${esc(s.description)}</td></tr>`
    )
    .join("");
  const castRows = sheet.cast
    .map(
      (c) =>
        `<tr><td>${esc(c.character)}</td><td>${esc(c.pickupOrCall ?? "")}</td></tr>`
    )
    .join("");
  const deptRows = sheet.departmentNotes
    .map(
      (d) =>
        `<li><strong>${esc(d.department)}:</strong> ${esc(d.note)}</li>`
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(projectName)} — Call Sheet Day ${day.dayNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #111; padding: 28px 32px; }
    header { border-bottom: 3px double #111; padding-bottom: 10px; margin-bottom: 16px; }
    .prod { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #555; }
    h1 { font-size: 22px; margin-top: 4px; }
    .meta { font-size: 12px; color: #444; margin-top: 6px; display: flex; gap: 16px; flex-wrap: wrap; }
    .meta b { color: #111; }
    h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 18px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    td, th { text-align: left; padding: 4px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
    .num { font-family: monospace; width: 60px; }
    ul { font-size: 12px; line-height: 1.6; margin-left: 18px; }
    .advance { font-size: 12px; color: #333; margin-top: 8px; }
    .ai-note { margin-top: 22px; font-size: 10px; color: #888; border-top: 1px solid #eee; padding-top: 8px; }
  </style></head><body>
    <header>
      <div class="prod">${esc(projectName)} — Call Sheet</div>
      <h1>Day ${day.dayNumber} · ${esc(formatSheetDate(day.date))}</h1>
      <div class="meta">
        <span><b>Location:</b> ${esc(day.locations.join(" → ") || "TBD")}</span>
        ${sheet.generalCall ? `<span><b>General call:</b> ${esc(sheet.generalCall)}</span>` : day.callTime ? `<span><b>Call:</b> ${esc(day.callTime)}</span>` : ""}
        ${day.wrapTime ? `<span><b>Est. wrap:</b> ${esc(day.wrapTime)}</span>` : ""}
        ${day.weather ? `<span><b>Weather:</b> ${esc(day.weather)}</span>` : ""}
      </div>
    </header>

    <h2>Shooting Order</h2>
    <table><tbody>${sceneRows || `<tr><td colspan="2">No scenes listed.</td></tr>`}</tbody></table>

    <h2>Cast — Pickup / On Set</h2>
    <table><tbody>${castRows || `<tr><td colspan="2">No cast listed.</td></tr>`}</tbody></table>

    <h2>Department Notes</h2>
    <ul>${deptRows || "<li>None.</li>"}</ul>

    ${sheet.advanceSchedule ? `<h2>Advance Schedule</h2><div class="advance">${esc(sheet.advanceSchedule)}</div>` : ""}

    <div class="ai-note">AI-drafted call sheet — review every time, cast and department detail against the DOOD and contacts before distribution.</div>
  </body></html>`;

  openPrintWindow(html, "the call sheet");
}

function formatSheetDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "short", day: "numeric" });
}

// ------------------------------------------------------------
// Full workspace backup / restore
// ------------------------------------------------------------
export function exportBackup(): void {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) {
    alert("Nothing to back up yet.");
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  downloadText(`scenetrackable-backup-${stamp}.json`, raw, "application/json");
}

/**
 * Give the restored workspace a completed AI daily digest so every AI surface
 * reads as "done" the moment dummy data lands — no key, no waiting, no rate
 * limits during a demo. A hand-authored digest in the file is kept as-is (only
 * its freshness hash is re-stamped to the current numbers so the dashboard
 * doesn't flag it "out of date"); anything else gets a synthesized one.
 */
function ensureFreshDigest(state: Record<string, unknown>): void {
  if (!state || !state.production || !Array.isArray(state.scenes)) return;
  try {
    const input = buildDigestInput(state as unknown as ProductionData);
    const existing = state.aiDigest as { text?: string; model?: string } | undefined;
    const curated = typeof existing?.text === "string" && existing.text.trim().length > 0;
    state.aiDigest = {
      at: new Date().toISOString(),
      text: curated ? existing!.text : demoDigest(input.facts),
      hash: input.hash,
      model: existing?.model ?? "demo",
    };
  } catch {
    // A partial dummy file just won't get a synthesized digest — the dashboard
    // falls back to its "AI summary pending" state, which is fine.
  }
}

/** Shared validation + apply for a persisted-store payload. */
function applyBackupText(text: string): string | null {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || !parsed.state || typeof parsed.version !== "number") {
    return "This file doesn't look like a SceneTrackable backup.";
  }
  if (!Array.isArray(parsed.state.users) || !Array.isArray(parsed.state.projects)) {
    return "Backup is missing core data (users/projects).";
  }
  ensureFreshDigest(parsed.state);
  localStorage.setItem(STORE_KEY, JSON.stringify(parsed));
  window.location.reload();
  return null;
}

/** Validates and restores a backup file, then reloads the app. */
export async function importBackup(file: File): Promise<string | null> {
  try {
    return applyBackupText(await file.text());
  } catch {
    return "Could not read the backup file (invalid JSON).";
  }
}

/**
 * Loads the bundled showcase production (`public/sample-production.json`)
 * through the same restore path as a backup — so it lands as real, editable,
 * cloud-syncable data, not a special mode. Reloads on success.
 */
export async function loadSampleProduction(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}sample-production.json`, {
      cache: "no-store",
    });
    if (!res.ok) return `Couldn't load the sample (HTTP ${res.status}).`;
    return applyBackupText(await res.text());
  } catch {
    return "Couldn't load the sample production. Check your connection and try again.";
  }
}
