// ============================================================
// SCRIPT INGEST — PDF extraction, screenplay parsing, breakdown run
// ============================================================

import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Scene, BreakdownElement, ElementCategory, AIUsageEntry } from "@/types";
import { id } from "@/lib/utils";
import { aiBreakdownScene, demoBreakdown, mapWithConcurrency } from "@/lib/claude";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// ------------------------------------------------------------
// PDF → text
// ------------------------------------------------------------
export async function extractPdfText(file: File): Promise<{ text: string; pageCount: number }> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Reconstruct lines from positioned text items.
    let lastY: number | null = null;
    let line = "";
    for (const item of content.items as { str: string; transform: number[] }[]) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 4) {
        text += line.trimEnd() + "\n";
        line = "";
      }
      line += item.str;
      lastY = y;
    }
    if (line.trim()) text += line.trimEnd() + "\n";
    text += "\n";
  }
  return { text, pageCount: pdf.numPages };
}

// ------------------------------------------------------------
// Screenplay → scenes
// ------------------------------------------------------------
const HEADING_RE =
  /^\s*(\d+[A-Z]?[\.\)]?\s+)?(INT\.?\/EXT\.?|INT\.?|EXT\.?|I\/E\.?|EST\.?)\s+(.+)$/i;

function normIntExt(raw: string): Scene["intExt"] {
  const r = raw.toUpperCase();
  if (r.startsWith("INT/") || r.startsWith("INT.") === false && r.includes("/")) return "INT/EXT";
  if (r.startsWith("INT")) return "INT";
  if (r.startsWith("EXT")) return "EXT";
  return "INT/EXT";
}

function normTime(tail: string): Scene["timeOfDay"] {
  const t = tail.toUpperCase();
  if (/\bNIGHT\b/.test(t)) return "NIGHT";
  if (/\bDAWN\b/.test(t) || /\bSUNRISE\b/.test(t)) return "DAWN";
  if (/\bDUSK\b/.test(t) || /\bSUNSET\b|\bEVENING\b/.test(t)) return "DUSK";
  return "DAY";
}

function splitHeading(rest: string): { location: string; time: Scene["timeOfDay"] } {
  // Location and time are usually separated by " - " or " — ".
  const parts = rest.split(/\s[-–—]\s/);
  if (parts.length > 1) {
    const time = normTime(parts[parts.length - 1]);
    const location = parts.slice(0, -1).join(" - ").trim();
    return { location: location || rest.trim(), time };
  }
  return { location: rest.trim(), time: normTime(rest) };
}

function estimatePages(body: string): number {
  const words = body.split(/\s+/).filter(Boolean).length;
  const pages = words / 180; // ~180 words per screenplay page
  return Math.max(0.125, Math.round(pages * 8) / 8);
}

/** Parse raw screenplay text into scenes (no elements yet). */
export function parseScreenplay(raw: string): Scene[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const scenes: Scene[] = [];
  let current: { headingRest: string; intExt: string; sceneNo?: string; body: string[] } | null = null;
  let autoNum = 0;

  const flush = () => {
    if (!current) return;
    const { location, time } = splitHeading(current.headingRest);
    const body = current.body.join("\n").trim();
    autoNum += 1;
    const number = (current.sceneNo || String(autoNum)).replace(/[.)]/g, "").trim();
    scenes.push({
      id: id("sc"),
      number,
      intExt: normIntExt(current.intExt),
      location: location.replace(/\s+/g, " "),
      timeOfDay: time,
      synopsis: body.slice(0, 140).replace(/\n/g, " "),
      scriptText: body,
      pages: estimatePages(body),
      estimatedShootMinutes: Math.max(15, Math.round(estimatePages(body) * 45)),
      elements: [],
      vfxFlags: false,
      sfxFlags: false,
    });
  };

  for (const line of lines) {
    const m = line.match(HEADING_RE);
    if (m) {
      flush();
      current = {
        sceneNo: m[1]?.trim(),
        intExt: m[2],
        headingRest: m[3],
        body: [],
      };
    } else if (current) {
      current.body.push(line);
    }
  }
  flush();
  return scenes;
}

// ------------------------------------------------------------
// Character extraction — dialogue cues across the whole script
// ------------------------------------------------------------
const NON_CHARACTER = /^(INT|EXT|CUT TO|FADE|CONTINUED|DISSOLVE|THE END|TITLE|SUPER|ANGLE|CLOSE|POV|LATER|MONTAGE|END OF)/;

/** Detect character names from ALL-CAPS dialogue cues, most frequent first. */
export function extractCharacters(scenes: Scene[]): string[] {
  const counts = new Map<string, number>();
  for (const sc of scenes) {
    for (const rawLine of sc.scriptText.split("\n")) {
      const t = rawLine.trim().replace(/\s*\((V\.O\.|O\.S\.|O\.C\.|CONT'D|CONT\.?D?)\)$/i, "");
      if (
        t.length >= 2 &&
        t.length <= 30 &&
        /^[A-Z][A-Z0-9 .'\-]*$/.test(t) &&
        !NON_CHARACTER.test(t)
      ) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([name]) => name);
}

// ------------------------------------------------------------
// Full breakdown run — enrich every scene via the AI (or demo)
// ------------------------------------------------------------
export interface BreakdownProgress {
  done: number;
  total: number;
  currentSceneNumber: string;
}

export interface BreakdownRunResult {
  scenes: Scene[];
  usage: Omit<AIUsageEntry, "id" | "at">[];
  fromMock: boolean;
  /** Scenes where the live API failed after retries (offline fallback was used). */
  failedScenes: { sceneNumber: string; error: string }[];
}

/** How many scenes to analyze in parallel against the live API. */
const BREAKDOWN_CONCURRENCY = 4;

export async function runBreakdown(
  scenes: Scene[],
  onProgress?: (p: BreakdownProgress) => void,
  projectName?: string
): Promise<BreakdownRunResult> {
  const usage: Omit<AIUsageEntry, "id" | "at">[] = [];
  const failedScenes: { sceneNumber: string; error: string }[] = [];
  let anyMock = false;
  let done = 0;

  const characters = extractCharacters(scenes);
  onProgress?.({ done: 0, total: scenes.length, currentSceneNumber: scenes[0]?.number ?? "" });

  const out = await mapWithConcurrency(scenes, BREAKDOWN_CONCURRENCY, async (scene) => {
    let proposalElements;
    let duration = scene.estimatedShootMinutes;

    try {
      const { proposal, result } = await aiBreakdownScene(scene, { characters, projectName });
      if (result.fromMock) anyMock = true;
      usage.push({
        feature: "script_breakdown",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        model: result.model,
        costUsd: result.costUsd,
      });
      proposalElements = proposal.elements;
      duration = proposal.estimated_duration_minutes || duration;
    } catch (err) {
      // Live API failed after retries — keep the run going with the offline
      // heuristic for this scene, but report it honestly to the caller.
      failedScenes.push({
        sceneNumber: scene.number,
        error: (err as Error).message || "Unknown error",
      });
      const fallback = demoBreakdown(scene);
      proposalElements = fallback.elements;
      duration = fallback.estimated_duration_minutes;
    }

    const elements: BreakdownElement[] = proposalElements.map((e) => ({
      id: id("el"),
      name: e.name,
      category: e.category as ElementCategory,
      subCategory: e.subCategory,
      description: e.description,
      notes: e.notes,
    }));

    done += 1;
    onProgress?.({ done, total: scenes.length, currentSceneNumber: scene.number });

    return {
      ...scene,
      elements,
      estimatedShootMinutes: duration,
      vfxFlags: elements.some((e) => e.category === "vfx"),
      sfxFlags: elements.some((e) => e.category === "sfx"),
    };
  });

  onProgress?.({ done: scenes.length, total: scenes.length, currentSceneNumber: "" });
  return { scenes: out, usage, fromMock: anyMock, failedScenes };
}
