// ============================================================
// AI API WRAPPER — SceneTrackable
// Browser-direct calls (admin supplies key in AI Settings) with a
// high-quality built-in demo fallback so the app works with no key.
// Live calls retry on transient errors and never silently degrade
// to demo output — API failures surface to the caller.
//
// Two providers are supported: Anthropic (Claude) and Google (Gemini).
// The provider is derived from the selected model id rather than stored
// separately, so the two can never drift out of sync.
// ============================================================

import type { AIFeature, ElementCategory, Scene } from "@/types";
import { useStore } from "@/state/store";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "claude-opus-4-8";

export type AIProvider = "anthropic" | "google";

const KEY_STORAGE: Record<AIProvider, string> = {
  anthropic: "scenetrackable-claude-key",
  google: "scenetrackable-gemini-key",
};

export interface ModelInfo {
  id: string;
  label: string;
  desc: string;
  provider: AIProvider;
  /** Usable on the provider's no-cost tier. */
  freeTier?: boolean;
}

export const MODELS: ModelInfo[] = [
  { id: "claude-opus-4-8", label: "Opus 4.8", desc: "Most capable · highest quality", provider: "anthropic" },
  { id: "claude-sonnet-5", label: "Sonnet 5", desc: "Balanced · fast & cost-effective", provider: "anthropic" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", desc: "Fastest · lowest cost", provider: "anthropic" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", desc: "Most capable Gemini · paid only", provider: "google" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", desc: "Free tier · best free-tier quality", provider: "google", freeTier: true },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", desc: "Free tier · fastest, lighter analysis", provider: "google", freeTier: true },
];

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  anthropic: "Anthropic Claude",
  google: "Google Gemini",
};

export const PROVIDER_KEY_HINTS: Record<AIProvider, { placeholder: string; console: string }> = {
  anthropic: { placeholder: "sk-ant-api03-…", console: "console.anthropic.com" },
  google: { placeholder: "AIza…", console: "aistudio.google.com/apikey" },
};

export function providerForModel(model: string): AIProvider {
  return model.startsWith("gemini") ? "google" : "anthropic";
}

// Approximate list pricing per 1M tokens, by model.
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8": { in: 5.0, out: 25.0 },
  "claude-sonnet-5": { in: 3.0, out: 15.0 },
  "claude-haiku-4-5": { in: 1.0, out: 5.0 },
  "gemini-2.5-pro": { in: 1.25, out: 10.0 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
};

export function estimateCost(inputTokens: number, outputTokens: number, model?: string): number {
  const price = PRICING[model ?? activeModel()] ?? PRICING[DEFAULT_MODEL];
  return (inputTokens / 1_000_000) * price.in + (outputTokens / 1_000_000) * price.out;
}

// ------------------------------------------------------------
// Key management (admin-only surface enforces access in the UI)
// ------------------------------------------------------------
export function getApiKey(provider: AIProvider = activeProvider()): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE[provider]);
  } catch {
    return null;
  }
}

export function setApiKey(key: string | null, provider: AIProvider = activeProvider()): void {
  try {
    if (!key) localStorage.removeItem(KEY_STORAGE[provider]);
    else localStorage.setItem(KEY_STORAGE[provider], key);
  } catch {
    /* noop */
  }
}

export function hasApiKey(provider: AIProvider = activeProvider()): boolean {
  return Boolean(getApiKey(provider));
}

function activeModel(): string {
  try {
    return useStore.getState().aiConfig.model || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export function activeProvider(): AIProvider {
  return providerForModel(activeModel());
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

/** One provider-specific HTTP attempt. Returns null-free parsed output or throws. */
interface LiveRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  /** Pull text + token counts out of the provider's response shape. */
  parse: (data: any) => { text: string; inputTokens: number; outputTokens: number };
}

function anthropicRequest(opts: ClaudeCallOptions, model: string, apiKey: string): LiveRequest {
  // NOTE: no temperature / top_p — those are rejected (400) on Opus 4.8 / Sonnet 5.
  return {
    url: ANTHROPIC_URL,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
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
    }),
    parse: (data) => ({
      text: data.content?.find((b: { type: string }) => b.type === "text")?.text || "",
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    }),
  };
}

/**
 * Gemini's responseSchema is an OpenAPI subset — it rejects the
 * `additionalProperties` that the Anthropic schema carries.
 */
function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "additionalProperties") continue;
      out[k] = strip(v);
    }
    return out;
  };
  return strip(schema) as Record<string, unknown>;
}

function geminiRequest(opts: ClaudeCallOptions, model: string, apiKey: string): LiveRequest {
  // Gemini 2.5 counts thinking against maxOutputTokens; Flash tiers let us
  // switch it off, which mirrors the "low effort" setting on the Claude path.
  // Pro has a non-zero minimum thinking budget, so it is left at the default.
  const canDisableThinking = model !== "gemini-2.5-pro";
  return {
    url: `${GEMINI_BASE}/${model}:generateContent`,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: [{ text: opts.user }] }],
      generationConfig: {
        maxOutputTokens: opts.maxTokens ?? 1200,
        ...(canDisableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        ...(opts.jsonSchema
          ? {
              responseMimeType: "application/json",
              responseSchema: toGeminiSchema(opts.jsonSchema),
            }
          : {}),
      },
    }),
    parse: (data) => ({
      text:
        data.candidates?.[0]?.content?.parts
          ?.map((p: { text?: string }) => p.text ?? "")
          .join("") || "",
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    }),
  };
}

async function callLive(opts: ClaudeCallOptions): Promise<ClaudeResult> {
  const provider = activeProvider();
  const apiKey = getApiKey(provider);
  if (!apiKey) throw new ClaudeApiError("No API key set");
  const model = activeModel();
  const req =
    provider === "google"
      ? geminiRequest(opts, model, apiKey)
      : anthropicRequest(opts, model, apiKey);

  let lastError: ClaudeApiError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
    } catch (e) {
      // Network failure — retryable.
      lastError = new ClaudeApiError(`Network error: ${(e as Error).message}`);
      await sleep(1000 * 2 ** attempt + Math.random() * 400);
      continue;
    }

    if (res.ok) {
      const { text, inputTokens, outputTokens } = req.parse(await res.json());
      return {
        text,
        inputTokens,
        outputTokens,
        costUsd: estimateCost(inputTokens, outputTokens, model),
        model,
        fromMock: false,
      };
    }

    const errText = await res.text();
    lastError = new ClaudeApiError(
      `${PROVIDER_LABELS[provider]} API error ${res.status} — ${errText.slice(0, 200)}`,
      res.status
    );
    if (!RETRYABLE_STATUS.has(res.status)) throw lastError;

    const retryAfter = Number(res.headers.get("retry-after"));
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 1000 * 2 ** attempt + Math.random() * 400;
    await sleep(backoff);
  }

  throw lastError ?? new ClaudeApiError(`${PROVIDER_LABELS[provider]} API call failed`);
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
  const model = activeModel();
  return {
    text,
    inputTokens,
    outputTokens,
    costUsd: estimateCost(inputTokens, outputTokens, model),
    model: model + " · demo",
    fromMock: true,
  };
}

/**
 * With a key for the active model's provider: live call (throws on failure —
 * no silent demo fallback). Without a key: demo mode.
 */
export async function callClaude(opts: ClaudeCallOptions, sceneCtx?: Scene): Promise<ClaudeResult> {
  if (hasApiKey()) return callLive(opts);
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

/**
 * Models occasionally wrap structured output in prose or a fence even when a
 * schema is set, so slice to the outermost JSON object rather than trusting
 * the whole response to parse.
 */
function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return text;
  return text.slice(start, end + 1);
}

function normalizeProposal(parsed: any, scene?: Scene): SceneBreakdownProposal {
  return {
    elements: Array.isArray(parsed?.elements)
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
      Number(parsed?.estimated_duration_minutes) ||
      (scene ? Math.max(15, Math.round(scene.pages * 45)) : 45),
  };
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

const BREAKDOWN_SYSTEM = `You are an experienced 1st Assistant Director and script supervisor producing a professional shooting-script breakdown. Extract every production element a department would need to prep the scene.
Category definitions:
- cast: named speaking characters. extras: background/atmosphere performers.
- props: hand props / set-critical objects. wardrobe: costumes tied to a character.
- sfx: practical/special effects. vfx: visual/digital effects. vehicles / animals as literal.
- locations: the physical place(s) needed. makeup: makeup/hair/prosthetics. stunts: stunt action.
- production: production requirements (permits, generators, cranes, road closures, catering notes, safety).
"subCategory" is a short qualifier (e.g. "Lead", "Hero prop", "Digital", "Picture car"). "description" is a concise production note. "notes" may be empty.
Be specific and thorough — this feeds a real production department. Only include cast members who actually appear in the scene being analyzed.
Use the character list you are given as the source of truth for cast naming: refer to each character by their canonical name even when the scene text uses a nickname, a description, or a dialogue cue variant.`;

export interface BreakdownContext {
  /** Character names detected across the whole screenplay. */
  characters?: string[];
  /** Project / production title for context. */
  projectName?: string;
}

// ============================================================
// CHARACTER BIBLE — one pass over the whole screenplay
//
// Runs once per breakdown and feeds every scene batch. Two reasons it beats
// the ALL-CAPS dialogue-cue heuristic it replaces: a model reading the whole
// script can tell a speaking role from a mentioned one and can collapse
// "MRS. HALLORAN" / "EDITH" / "MOTHER" into one person — neither of which a
// regex over cues can do. It also costs one request, not one per scene.
// ============================================================

export type CharacterImportance = "lead" | "supporting" | "minor" | "background";

export interface ScriptCharacter {
  name: string;
  aliases?: string[];
  speaking: boolean;
  importance: CharacterImportance;
  description?: string;
  firstSceneNumber?: string;
}

const CHARACTER_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["characters"],
  properties: {
    characters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "speaking", "importance"],
        properties: {
          name: { type: "string" },
          aliases: { type: "array", items: { type: "string" } },
          speaking: { type: "boolean" },
          importance: { type: "string", enum: ["lead", "supporting", "minor", "background"] },
          description: { type: "string" },
          firstSceneNumber: { type: "string" },
        },
      },
    },
  },
};

const CHARACTER_SYSTEM = `You are a script supervisor building the character list for a film production from a complete screenplay.

Read the whole screenplay before answering. For every distinct human or creature character:
- Give the canonical name a call sheet would use — usually the dialogue-cue name.
- Collect every other way the script refers to them into aliases: nicknames, shortened or formal versions of the name, and the descriptive tags used before they are formally named ("THE MAN IN THE GREY COAT", "WAITRESS") when those later resolve to the same person. One person must appear exactly once, never split across their aliases.
- Mark speaking true only if they are ever given dialogue. Characters who only appear in action lines, or who are merely talked about by others, are non-speaking — this distinction drives casting and cost, so be exact about it.
- Judge importance from how much the story rests on them across the whole script, not from how many lines they have in any one scene.

Watch for the introductions a first read misses: a character named only once in an action line and referred to by role afterwards; a character introduced under one name who is revealed to be another; voices on a phone or over radio; characters described but never named. Include them.
Exclude places, organizations, and transitions.`;

/** One request over the full screenplay. Throws on live-API failure. */
export async function aiCharacterBible(
  fullScript: string,
  projectName?: string
): Promise<{ characters: ScriptCharacter[]; result: ClaudeResult }> {
  const result = await callClaude({
    feature: "character_bible",
    system: CHARACTER_SYSTEM,
    user: `${projectName ? `PRODUCTION: ${projectName}\n\n` : ""}COMPLETE SCREENPLAY:\n\n${fullScript}`,
    maxTokens: 8000,
    jsonSchema: CHARACTER_SCHEMA,
  });

  let characters: ScriptCharacter[] = [];
  try {
    const parsed = JSON.parse(extractJson(result.text));
    characters = Array.isArray(parsed.characters)
      ? parsed.characters
          .filter((c: ScriptCharacter) => c && c.name)
          .map((c: ScriptCharacter) => ({
            name: String(c.name).trim(),
            aliases: Array.isArray(c.aliases) ? c.aliases.map(String) : undefined,
            speaking: Boolean(c.speaking),
            importance: (["lead", "supporting", "minor", "background"] as const).includes(c.importance)
              ? c.importance
              : "minor",
            description: c.description ? String(c.description) : undefined,
            firstSceneNumber: c.firstSceneNumber ? String(c.firstSceneNumber) : undefined,
          }))
      : [];
  } catch {
    if (!result.fromMock) throw new ClaudeApiError("Could not parse the character list as JSON.");
  }
  return { characters, result };
}

/** Render the bible into the context block each breakdown batch receives. */
export function describeCharacters(characters: ScriptCharacter[]): string {
  return characters
    .map((c) => {
      const bits = [c.importance, c.speaking ? "speaking" : "non-speaking"];
      if (c.aliases?.length) bits.push(`also called ${c.aliases.join(", ")}`);
      return `- ${c.name} (${bits.join("; ")})${c.description ? ` — ${c.description}` : ""}`;
    })
    .join("\n");
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
    proposal = normalizeProposal(JSON.parse(extractJson(result.text)), scene);
  } catch {
    if (!result.fromMock) {
      throw new ClaudeApiError("Could not parse the AI response as JSON.");
    }
    proposal = demoBreakdown(scene);
  }
  return { proposal, result };
}

// ============================================================
// BATCHED BREAKDOWN
//
// One request per group of scenes instead of one per scene. The provider's
// context window is vast compared to a screenplay, so the limit that matters
// is output tokens, not input — batching cuts a 60-scene script from 60
// requests to about 7, which keeps runs well inside free-tier rate limits
// and lets the model reason across neighbouring scenes.
// ============================================================

/** Scenes per request. Sized so a batch's JSON fits comfortably in the output budget. */
export const BREAKDOWN_BATCH_SIZE = 10;

const BATCH_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["scenes"],
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["scene_number", "elements", "estimated_duration_minutes"],
        properties: {
          scene_number: { type: "string" },
          elements: (BREAKDOWN_SCHEMA.properties as any).elements,
          estimated_duration_minutes: { type: "number" },
        },
      },
    },
  },
};

function sceneBlock(scene: Scene): string {
  return `### SCENE ${scene.number} — ${scene.intExt}. ${scene.location} — ${scene.timeOfDay}\n${
    scene.scriptText || scene.synopsis
  }`;
}

/**
 * Break down several scenes in one request.
 *
 * Returns proposals keyed by scene number. A batch that comes back short is
 * not an error — the caller fills the gaps — but a batch that fails outright
 * throws, so the run can report it rather than quietly degrade.
 */
export async function aiBreakdownBatch(
  scenes: Scene[],
  ctx?: BreakdownContext & { characterBible?: ScriptCharacter[] }
): Promise<{ proposals: Map<string, SceneBreakdownProposal>; result: ClaudeResult }> {
  const contextLines: string[] = [];
  if (ctx?.projectName) contextLines.push(`PRODUCTION: ${ctx.projectName}`);
  if (ctx?.characterBible?.length) {
    contextLines.push(`CHARACTERS IN THIS SCREENPLAY:\n${describeCharacters(ctx.characterBible)}`);
  } else if (ctx?.characters?.length) {
    contextLines.push(`KNOWN CHARACTERS IN THIS SCREENPLAY: ${ctx.characters.join(", ")}`);
  }

  const result = await callClaude(
    {
      feature: "script_breakdown",
      system: BREAKDOWN_SYSTEM,
      user: `${contextLines.join("\n\n")}${contextLines.length ? "\n\n" : ""}Break down each of the following ${
        scenes.length
      } scenes independently. Return one entry per scene, using the exact scene_number shown.\n\n${scenes
        .map(sceneBlock)
        .join("\n\n")}`,
      // Roughly 1.4k tokens of elements per scene, plus headroom.
      maxTokens: Math.min(32000, 1500 * scenes.length + 1000),
      jsonSchema: BATCH_SCHEMA,
    },
    scenes[0]
  );

  const proposals = new Map<string, SceneBreakdownProposal>();
  try {
    const parsed = JSON.parse(extractJson(result.text));
    if (Array.isArray(parsed.scenes)) {
      for (const entry of parsed.scenes) {
        const num = String(entry?.scene_number ?? "").trim();
        if (!num) continue;
        const scene = scenes.find((s) => s.number === num);
        proposals.set(num, normalizeProposal(entry, scene));
      }
    }
  } catch {
    if (!result.fromMock) throw new ClaudeApiError("Could not parse the AI response as JSON.");
  }

  // Demo mode has no batch shape — synthesize per scene so the run still works.
  if (result.fromMock && proposals.size === 0) {
    for (const s of scenes) proposals.set(s.number, demoBreakdown(s));
  }

  return { proposals, result };
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
