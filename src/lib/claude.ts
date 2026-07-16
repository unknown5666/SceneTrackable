// ============================================================
// CLAUDE API WRAPPER — SceneTrackable
// Browser-direct calls (admin supplies key in AI Settings) with a
// high-quality built-in demo fallback so the app works with no key.
// Live calls retry on transient errors and never silently degrade
// to demo output — API failures surface to the caller.
// ============================================================

import type { AIFeature, ElementCategory, Scene } from "@/types";
import { useStore } from "@/state/store";

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-opus-4-8";
const KEY_STORAGE = "scenetrackable-claude-key";

// Approximate blended pricing per 1M tokens (Opus-tier reference).
const PRICE_PER_M_INPUT_USD = 5.0;
const PRICE_PER_M_OUTPUT_USD = 25.0;

export function estimateCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * PRICE_PER_M_INPUT_USD +
    (outputTokens / 1_000_000) * PRICE_PER_M_OUTPUT_USD
  );
}

// ------------------------------------------------------------
// Key management (admin-only surface enforces access in the UI)
// ------------------------------------------------------------
export function getApiKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function setApiKey(key: string | null): void {
  try {
    if (!key) localStorage.removeItem(KEY_STORAGE);
    else localStorage.setItem(KEY_STORAGE, key);
  } catch {
    /* noop */
  }
}

export function hasApiKey(): boolean {
  return Boolean(getApiKey());
}

function activeModel(): string {
  try {
    return useStore.getState().aiConfig.model || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

// ------------------------------------------------------------
// Core call
// ------------------------------------------------------------
export class ClaudeApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ClaudeApiError";
    this.status = status;
  }
}

export interface ClaudeCallOptions {
  system: string;
  user: string;
  maxTokens?: number;
  feature: AIFeature;
  /** When set, the API is forced to return JSON matching this schema. */
  jsonSchema?: Record<string, unknown>;
}

export interface ClaudeResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
  fromMock: boolean;
}

const MAX_ATTEMPTS = 4;
const RETRYABLE_STATUS = new Set([429, 500, 503, 529]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function callClaudeLive(opts: ClaudeCallOptions): Promise<ClaudeResult> {
  const apiKey = getApiKey();
  if (!apiKey) throw new ClaudeApiError("No API key set");
  const model = activeModel();

  // NOTE: no temperature / top_p — those are rejected (400) on Opus 4.8 / Sonnet 5.
  const body = JSON.stringify({
    model,
    max_tokens: opts.maxTokens ?? 1200,
    system: opts.system,
    output_config: {
      effort: "low",
      ...(opts.jsonSchema
        ? { format: { type: "json_schema", schema: opts.jsonSchema } }
        : {}),
    },
    messages: [{ role: "user", content: opts.user }],
  });

  let lastError: ClaudeApiError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body,
      });
    } catch (e) {
      // Network failure — retryable.
      lastError = new ClaudeApiError(`Network error: ${(e as Error).message}`);
      await sleep(1000 * 2 ** attempt + Math.random() * 400);
      continue;
    }

    if (res.ok) {
      const data = await res.json();
      const text: string =
        data.content?.find((b: { type: string }) => b.type === "text")?.text || "";
      const inputTokens = data.usage?.input_tokens ?? 0;
      const outputTokens = data.usage?.output_tokens ?? 0;
      return {
        text,
        inputTokens,
        outputTokens,
        costUsd: estimateCost(inputTokens, outputTokens),
        model,
        fromMock: false,
      };
    }

    const errText = await res.text();
    lastError = new ClaudeApiError(
      `Claude API error ${res.status} — ${errText.slice(0, 200)}`,
      res.status
    );
    if (!RETRYABLE_STATUS.has(res.status)) throw lastError;

    const retryAfter = Number(res.headers.get("retry-after"));
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 1000 * 2 ** attempt + Math.random() * 400;
    await sleep(backoff);
  }

  throw lastError ?? new ClaudeApiError("Claude API call failed");
}

async function fakeDelay(ms = 500 + Math.random() * 500): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function callClaudeMock(opts: ClaudeCallOptions, sceneCtx?: Scene): Promise<ClaudeResult> {
  await fakeDelay();
  let text = "";
  if (opts.feature === "script_breakdown") {
    text = JSON.stringify(demoBreakdown(sceneCtx, opts.user));
  } else {
    text = "Demo response.";
  }
  const inputTokens = estimateTokens(opts.system + opts.user);
  const outputTokens = estimateTokens(text);
  return {
    text,
    inputTokens,
    outputTokens,
    costUsd: estimateCost(inputTokens, outputTokens),
    model: activeModel() + " · demo",
    fromMock: true,
  };
}

/**
 * With a key: live call (throws on failure — no silent demo fallback).
 * Without a key: demo mode.
 */
export async function callClaude(opts: ClaudeCallOptions, sceneCtx?: Scene): Promise<ClaudeResult> {
  if (hasApiKey()) return callClaudeLive(opts);
  return callClaudeMock(opts, sceneCtx);
}

// ------------------------------------------------------------
// Bounded-concurrency map (preserves input order in the result)
// ------------------------------------------------------------
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// ============================================================
// SCRIPT BREAKDOWN
// ============================================================

export const CATEGORY_LIST: ElementCategory[] = [
  "cast",
  "extras",
  "props",
  "wardrobe",
  "sfx",
  "vfx",
  "vehicles",
  "animals",
  "locations",
  "makeup",
  "stunts",
  "production",
];

export interface ProposedElement {
  name: string;
  category: ElementCategory;
  subCategory?: string;
  description?: string;
  notes?: string;
}

export interface SceneBreakdownProposal {
  elements: ProposedElement[];
  estimated_duration_minutes: number;
}

const BREAKDOWN_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["elements", "estimated_duration_minutes"],
  properties: {
    elements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "category"],
        properties: {
          name: { type: "string" },
          category: { type: "string", enum: CATEGORY_LIST },
          subCategory: { type: "string" },
          description: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
    estimated_duration_minutes: { type: "number" },
  },
};

const BREAKDOWN_SYSTEM = `You are an experienced 1st Assistant Director and script supervisor producing a professional shooting-script breakdown. Given one scene, extract every production element.
Category definitions:
- cast: named speaking characters. extras: background/atmosphere performers.
- props: hand props / set-critical objects. wardrobe: costumes tied to a character.
- sfx: practical/special effects. vfx: visual/digital effects. vehicles / animals as literal.
- locations: the physical place(s) needed. makeup: makeup/hair/prosthetics. stunts: stunt action.
- production: production requirements (permits, generators, cranes, road closures, catering notes, safety).
"subCategory" is a short qualifier (e.g. "Lead", "Hero prop", "Digital", "Picture car"). "description" is a concise production note. "notes" may be empty.
Be specific and thorough — this feeds a real production department. Only include cast members who actually appear in THIS scene.`;

export interface BreakdownContext {
  /** Character names detected across the whole screenplay. */
  characters?: string[];
  /** Project / production title for context. */
  projectName?: string;
}

/** Break down a single scene. Returns the parsed proposal + usage. Throws on live-API failure. */
export async function aiBreakdownScene(
  scene: Scene,
  ctx?: BreakdownContext
): Promise<{
  proposal: SceneBreakdownProposal;
  result: ClaudeResult;
}> {
  const contextLines: string[] = [];
  if (ctx?.projectName) contextLines.push(`PRODUCTION: ${ctx.projectName}`);
  if (ctx?.characters?.length)
    contextLines.push(`KNOWN CHARACTERS IN THIS SCREENPLAY: ${ctx.characters.join(", ")}`);

  const result = await callClaude(
    {
      feature: "script_breakdown",
      system: BREAKDOWN_SYSTEM,
      user: `${contextLines.length ? contextLines.join("\n") + "\n\n" : ""}SCENE ${scene.number} — ${scene.intExt}. ${scene.location} — ${scene.timeOfDay}\n\n${scene.scriptText || scene.synopsis}`,
      maxTokens: 1400,
      jsonSchema: BREAKDOWN_SCHEMA,
    },
    scene
  );

  let proposal: SceneBreakdownProposal;
  try {
    const jsonStart = result.text.indexOf("{");
    const jsonEnd = result.text.lastIndexOf("}");
    const parsed = JSON.parse(result.text.slice(jsonStart, jsonEnd + 1));
    proposal = {
      elements: Array.isArray(parsed.elements)
        ? parsed.elements
            .filter((e: ProposedElement) => e && e.name && CATEGORY_LIST.includes(e.category))
            .map((e: ProposedElement) => ({
              name: String(e.name).trim(),
              category: e.category,
              subCategory: e.subCategory ? String(e.subCategory) : undefined,
              description: e.description ? String(e.description) : undefined,
              notes: e.notes ? String(e.notes) : undefined,
            }))
        : [],
      estimated_duration_minutes:
        Number(parsed.estimated_duration_minutes) || Math.max(15, Math.round(scene.pages * 45)),
    };
  } catch {
    if (!result.fromMock) {
      throw new ClaudeApiError("Could not parse the AI response as JSON.");
    }
    proposal = demoBreakdown(scene);
  }
  return { proposal, result };
}

// ------------------------------------------------------------
// Demo breakdown — keyword-driven, always plausible
// ------------------------------------------------------------
function pick(re: RegExp, text: string, flags = "g"): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const g = new RegExp(re.source, flags);
  while ((m = g.exec(text))) out.add(m[1] ?? m[0]);
  return [...out].slice(0, 5);
}

export function demoBreakdown(scene?: Scene, userText = ""): SceneBreakdownProposal {
  const text = (scene ? `${scene.location} ${scene.synopsis} ${scene.scriptText}` : userText).toLowerCase();
  const els: ProposedElement[] = [];

  // Cast: CAPITALIZED names in action lines are a rough heuristic.
  const source = scene?.scriptText || scene?.synopsis || userText;
  const names = pick(/\b([A-Z][A-Z]{2,})\b/, source).filter(
    (n) => !["INT", "EXT", "DAY", "NIGHT", "CONT", "CONTINUED"].includes(n)
  );
  names.forEach((n, i) =>
    els.push({
      name: n.charAt(0) + n.slice(1).toLowerCase(),
      category: "cast",
      subCategory: i === 0 ? "Lead" : "Supporting",
      description: "Speaking role present in scene",
    })
  );
  if (els.length === 0)
    els.push({ name: "Principal cast", category: "cast", subCategory: "Lead", description: "Present in scene" });

  const add = (name: string, category: ElementCategory, subCategory?: string, description?: string) =>
    els.push({ name, category, subCategory, description });

  if (/\b(car|truck|van|taxi|vehicle|drive|driving|engine)\b/.test(text))
    add("Picture vehicle", "vehicles", "Picture car", "Continuity + parking coordination");
  if (/\b(gun|blood|fire|explosion|smoke|rain|spark|wind)\b/.test(text))
    add("Practical effect", "sfx", "On-set", "Safety brief + effects supervisor required");
  if (/\b(screen|hologram|creature|sky|cgi|digital|composite)\b/.test(text))
    add("VFX shot", "vfx", "Digital", "Plate photography + clean pass");
  if (/\b(dog|cat|horse|bird|animal)\b/.test(text))
    add("Animal", "animals", "Trained", "Wrangler + welfare on set");
  if (/\b(phone|gun|glass|watch|letter|book|knife|cup|bottle)\b/.test(text))
    add("Hero prop", "props", "Hand prop", "Continuity critical");
  add("Costume — principal", "wardrobe", "Character", "Fitting + continuity stills");
  add("Standard makeup", "makeup", "Beauty", "Continuity per scene");
  if (/\b(crowd|street|party|restaurant|office|market|station)\b/.test(text))
    add("Background artists", "extras", "Atmosphere", "Approx. 8–15 to dress the scene");
  add(scene ? scene.location : "Primary location", "locations", scene?.intExt ?? "INT", "Permit + parking + power");
  if (scene?.timeOfDay === "NIGHT")
    add("Lighting / generator", "production", "Requirement", "Night exterior lighting package + genny");
  add("Standard unit requirements", "production", "Requirement", "Catering, base camp, safety");

  return {
    elements: els,
    estimated_duration_minutes: scene ? Math.max(15, Math.round(scene.pages * 45)) : 45,
  };
}
