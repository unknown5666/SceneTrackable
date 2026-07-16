// ============================================================
// EXPORT — CSV downloads, printable breakdown sheets, and full
// workspace backup / restore (JSON of the persisted store).
// ============================================================

import type { Scene } from "@/types";

const STORE_KEY = "scenetrackable-v1";

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
  const pages = scenes
    .map((sc) => {
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
          <div class="prod">${esc(projectName)} — Breakdown Sheet</div>
          <h2>Scene ${esc(sc.number)} · ${esc(sc.intExt)}. ${esc(sc.location)} — ${esc(sc.timeOfDay)}</h2>
          <div class="meta">${sc.pages} pages · est. ${sc.estimatedShootMinutes} min${sc.synopsis ? ` · ${esc(sc.synopsis)}` : ""}</div>
        </header>
        <div class="grid">${boxes || "<div class='box empty'>No elements recorded for this scene.</div>"}</div>
      </section>`;
    })
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(projectName)} — Breakdown Sheets</title>
  <style>
    * { box-sizing: border-box; margin: 0; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #111; }
    .sheet { page-break-after: always; padding: 28px 32px; }
    header { border-bottom: 3px double #111; padding-bottom: 10px; margin-bottom: 16px; }
    .prod { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #555; }
    h2 { font-size: 19px; margin-top: 4px; }
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

/** Validates and restores a backup file, then reloads the app. */
export async function importBackup(file: File): Promise<string | null> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || !parsed.state || typeof parsed.version !== "number") {
      return "This file doesn't look like a SceneTrackable backup.";
    }
    if (!Array.isArray(parsed.state.users) || !Array.isArray(parsed.state.projects)) {
      return "Backup is missing core data (users/projects).";
    }
    localStorage.setItem(STORE_KEY, text);
    window.location.reload();
    return null;
  } catch {
    return "Could not read the backup file (invalid JSON).";
  }
}
