// ============================================================
// SCRIPT INGEST — screenplay parsing and the breakdown run
//
// PDF extraction lives in `lib/pdf.ts`. It is deliberately not re-exported
// from here: a static re-export would drag the Vite-only worker import back
// into this module's graph, and the parser would stop loading outside the
// bundler. Import `extractPdfText` from `@/lib/pdf` directly.
// ============================================================

import type { Scene, BreakdownElement, ElementCategory, AIUsageEntry } from "@/types";
import { id } from "@/lib/utils";
import {
  aiBreakdownBatch,
  aiCharacterBible,
  aiLocationBible,
  fallbackLocations,
  demoBreakdown,
  mapWithConcurrency,
  BREAKDOWN_BATCH_SIZE,
  type ProposedLocation,
  type ScriptCharacter,
} from "@/lib/claude";

// ------------------------------------------------------------
// Screenplay → scenes
// ------------------------------------------------------------
const HEADING_RE =
  /^\s*(\d+[A-Z]?[\.\)]?\s+)?(INT\.?\/EXT\.?|INT\.?|EXT\.?|I\/E\.?|EST\.?)\s+(.+)$/i;

// Arabic sluglines carry the same fields in different words: an optional مشهد
// ("scene") label and number, then داخلي / خارجي for interior / exterior. The
// number may be Arabic-Indic, and a dash usually stands where an English script
// puts a period.
const HEADING_AR_RE =
  /^\s*(?:مشهد\s*)?([0-9٠-٩۰-۹]+[.)]?\s*[-–—]?\s*)?(داخلي\s*\/\s*خارجي|خارجي\s*\/\s*داخلي|داخلي|خارجي)\s*[.\-–—:]?\s+(.+)$/;

/** Arabic-Indic and Persian digits → ASCII, so scene numbers stay sortable. */
function toAsciiDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => {
    const c = d.charCodeAt(0);
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
  });
}

function normIntExt(raw: string): Scene["intExt"] {
  if (raw.includes("داخلي") && raw.includes("خارجي")) return "INT/EXT";
  if (raw.includes("داخلي")) return "INT";
  if (raw.includes("خارجي")) return "EXT";
  const r = raw.toUpperCase();
  if (r.startsWith("INT/") || r.startsWith("INT.") === false && r.includes("/")) return "INT/EXT";
  if (r.startsWith("INT")) return "INT";
  if (r.startsWith("EXT")) return "EXT";
  return "INT/EXT";
}

function normTime(tail: string): Scene["timeOfDay"] {
  const t = tail.toUpperCase();
  // \b is ASCII-only in JS, so the Arabic words match as plain substrings.
  if (/ليل/.test(t)) return "NIGHT";
  if (/فجر|شروق/.test(t)) return "DAWN";
  if (/غروب|مغرب|مساء/.test(t)) return "DUSK";
  if (/نهار|صباح|ظهر/.test(t)) return "DAY";
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
    const number = toAsciiDigits(current.sceneNo || String(autoNum))
      .replace(/[.)\-–—]/g, "")
      .trim();
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
    const m = line.match(HEADING_RE) ?? line.match(HEADING_AR_RE);
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
const NON_CHARACTER_AR =
  /^(مشهد|داخلي|خارجي|قطع|انتقال|مزج|نهاية|يتبع|تتمة|استمرار|عنوان)/;

/**
 * Arabic has no letter case, so the ALL-CAPS rule that finds English cues never
 * fires. What identifies a cue instead is its shape: a bare name alone on a
 * line — a few words, no sentence punctuation, sometimes a trailing colon.
 * Weaker than the caps rule, so the frequency floor below carries more of the
 * work here; this is the fallback for when the AI character pass is unavailable.
 */
function arabicCue(line: string): string | null {
  const t = line.trim().replace(/\s*(\([^)]*\))?\s*:?\s*$/, "").trim();
  if (t.length < 2 || t.length > 30) return null;
  if (!/[؀-ۿ]/.test(t)) return null;
  if (/[،؛؟!]/.test(t) || /\.$/.test(t)) return null;
  if (t.split(/\s+/).length > 4) return null;
  if (NON_CHARACTER_AR.test(t)) return null;
  return t;
}

/** Detect character names from dialogue cues, most frequent first. */
export function extractCharacters(scenes: Scene[]): string[] {
  const counts = new Map<string, number>();
  for (const sc of scenes) {
    for (const rawLine of sc.scriptText.split("\n")) {
      const t = rawLine.trim().replace(/\s*\((V\.O\.|O\.S\.|O\.C\.|CONT'D|CONT\.?D?)\)$/i, "");
      const name =
        t.length >= 2 &&
        t.length <= 30 &&
        /^[A-Z][A-Z0-9 .'\-]*$/.test(t) &&
        !NON_CHARACTER.test(t)
          ? t
          : arabicCue(rawLine);
      if (name) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
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
  /** What the run is doing right now, for the progress label. */
  stage: "characters" | "scenes";
  /** Set while the run is parked on a provider rate limit. */
  waitingSeconds?: number;
}

export interface BreakdownRunResult {
  scenes: Scene[];
  usage: Omit<AIUsageEntry, "id" | "at">[];
  fromMock: boolean;
  /** Scenes where the live API failed after retries (offline fallback was used). */
  failedScenes: { sceneNumber: string; error: string }[];
  /** Characters the AI found across the whole script. Empty in demo mode. */
  characters: ScriptCharacter[];
  /** Locations consolidated from the script — AI, or the deterministic fallback. */
  locations: ProposedLocation[];
}

/** The heading line the AI passes quote back, and the app matches on. */
export const sceneHeading = (s: Scene): string =>
  `SCENE ${s.number} — ${s.intExt}. ${s.location} — ${s.timeOfDay}`;

/** Full script text as the AI passes see it. */
export const fullScriptText = (scenes: Scene[]): string =>
  scenes.map((s) => `${sceneHeading(s)}\n${s.scriptText}`).join("\n\n");

/**
 * One location pass over the script, with the deterministic grouping as a
 * safety net. Never throws: a breakdown shouldn't fail because the location
 * consolidation did, and the fallback still fills the Locations page.
 */
export async function runLocationPass(
  scenes: Scene[],
  projectName?: string,
  onWait?: (seconds: number) => void
): Promise<{ locations: ProposedLocation[]; usage?: Omit<AIUsageEntry, "id" | "at">; fromMock: boolean }> {
  try {
    const { locations, result } = await aiLocationBible(
      fullScriptText(scenes),
      scenes.map(sceneHeading),
      projectName,
      onWait
    );
    if (locations.length > 0) {
      return {
        locations,
        usage: {
          feature: "location_bible",
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          model: result.model,
          costUsd: result.costUsd,
        },
        fromMock: result.fromMock,
      };
    }
  } catch {
    /* Falls through to the deterministic grouping. */
  }
  return { locations: fallbackLocations(scenes), fromMock: true };
}

/** How many batches to run against the live API at once. */
const BREAKDOWN_CONCURRENCY = 3;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Full breakdown: one character pass over the whole script, then batched
 * scene passes that all share it.
 *
 * The character pass is what makes the scene passes accurate — without it
 * every batch re-guesses who "the doctor" is — so it runs first and its
 * output is threaded through. If it fails, the run continues on the regex
 * fallback rather than aborting; a breakdown with weaker cast naming still
 * beats no breakdown.
 */
export async function runBreakdown(
  scenes: Scene[],
  onProgress?: (p: BreakdownProgress) => void,
  projectName?: string
): Promise<BreakdownRunResult> {
  const usage: Omit<AIUsageEntry, "id" | "at">[] = [];
  const failedScenes: { sceneNumber: string; error: string }[] = [];
  let anyMock = false;
  let done = 0;
  let stage: BreakdownProgress["stage"] = "characters";
  let currentSceneNumber = "";

  const report = (waitingSeconds?: number) =>
    onProgress?.({ done, total: scenes.length, currentSceneNumber, stage, waitingSeconds });

  // A long free-tier run spends real time parked on the limiter. Saying so
  // keeps it from looking hung.
  const onWait = (seconds: number) => report(seconds);

  // ---- Pass 1: who and where is this script? ----
  // The location pass doesn't feed the scene passes, so it rides alongside the
  // character pass rather than adding a third wait.
  report();

  let characters: ScriptCharacter[] = [];
  const fullScript = fullScriptText(scenes);
  const locationPass = runLocationPass(scenes, projectName, onWait);
  try {
    const bible = await aiCharacterBible(fullScript, projectName, onWait);
    characters = bible.characters;
    if (bible.result.fromMock) anyMock = true;
    usage.push({
      feature: "character_bible",
      inputTokens: bible.result.inputTokens,
      outputTokens: bible.result.outputTokens,
      model: bible.result.model,
      costUsd: bible.result.costUsd,
    });
  } catch {
    /* Handled by the heuristic fallback below. */
  }
  if (characters.length === 0) {
    // Either the pass failed or we're in demo mode. The cue heuristic is
    // weaker — it can't resolve nicknames or spot non-speaking roles — but
    // it keeps cast naming anchored to something rather than nothing.
    characters = extractCharacters(scenes).map((name) => ({
      name,
      speaking: true,
      importance: "supporting" as const,
    }));
  }

  // ---- Pass 2: break the scenes down in batches ----
  const batches = chunk(scenes, BREAKDOWN_BATCH_SIZE);
  const proposals = new Map<
    string,
    { elements: BreakdownElement[]; duration: number; synopsis?: string }
  >();

  stage = "scenes";
  currentSceneNumber = scenes[0]?.number ?? "";
  report();

  await mapWithConcurrency(batches, BREAKDOWN_CONCURRENCY, async (batch) => {
    const toElements = (els: { name: string; category: string; subCategory?: string; description?: string; notes?: string }[]) =>
      els.map((e) => ({
        id: id("el"),
        name: e.name,
        category: e.category as ElementCategory,
        subCategory: e.subCategory,
        description: e.description,
        notes: e.notes,
      }));

    try {
      const { proposals: got, result } = await aiBreakdownBatch(batch, {
        characterBible: characters,
        projectName,
        onWait,
      });
      if (result.fromMock) anyMock = true;
      usage.push({
        feature: "script_breakdown",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        model: result.model,
        costUsd: result.costUsd,
      });

      for (const scene of batch) {
        const p = got.get(scene.number);
        if (p) {
          proposals.set(scene.id, {
            elements: toElements(p.elements),
            duration: p.estimated_duration_minutes || scene.estimatedShootMinutes,
            synopsis: p.synopsis,
          });
        } else {
          // The batch succeeded but skipped this scene — don't leave it blank.
          failedScenes.push({
            sceneNumber: scene.number,
            error: "The AI returned no entry for this scene.",
          });
          const fb = demoBreakdown(scene);
          proposals.set(scene.id, { elements: toElements(fb.elements), duration: fb.estimated_duration_minutes });
        }
        done += 1;
        currentSceneNumber = scene.number;
        report();
      }
    } catch (err) {
      // The whole batch failed after retries. Report every scene in it and
      // fall back so the rest of the run still produces something usable.
      const message = (err as Error).message || "Unknown error";
      for (const scene of batch) {
        failedScenes.push({ sceneNumber: scene.number, error: message });
        const fb = demoBreakdown(scene);
        proposals.set(scene.id, { elements: toElements(fb.elements), duration: fb.estimated_duration_minutes });
        done += 1;
        currentSceneNumber = scene.number;
        report();
      }
    }
  });

  const out = scenes.map((scene) => {
    const p = proposals.get(scene.id);
    const elements = p?.elements ?? [];
    return {
      ...scene,
      elements,
      // The parser's synopsis is just the first 140 characters of the action —
      // usually a fragment. Prefer the model's sentence whenever it wrote one.
      synopsis: p?.synopsis ?? scene.synopsis,
      estimatedShootMinutes: p?.duration ?? scene.estimatedShootMinutes,
      vfxFlags: elements.some((e) => e.category === "vfx"),
      sfxFlags: elements.some((e) => e.category === "sfx"),
    };
  });

  const loc = await locationPass;
  if (loc.usage) usage.push(loc.usage);

  done = scenes.length;
  currentSceneNumber = "";
  report();
  return {
    scenes: out,
    usage,
    fromMock: anyMock,
    failedScenes,
    characters,
    locations: loc.locations,
  };
}
