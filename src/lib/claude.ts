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

import type {
  AIFeature,
  CharacterImportance,
  DepartmentId,
  ElementCategory,
  ProductionLocation,
  Scene,
  ScriptCharacter,
  TaskPriority,
} from "@/types";
import { DEPARTMENTS } from "@/data/schemas";
import { useStore } from "@/state/store";

/** Departments, as a schema enum. */
const DEPARTMENT_IDS = DEPARTMENTS as readonly string[];

// Re-exported so call sites can keep importing the AI vocabulary from here.
export type { CharacterImportance, ScriptCharacter };

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
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", desc: "Most capable Gemini · paid only", provider: "google" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", desc: "Free tier · best free-tier quality", provider: "google", freeTier: true },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", desc: "Free tier · fastest, lighter analysis", provider: "google", freeTier: true },
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
  "gemini-3.1-pro-preview": { in: 2.0, out: 12.0 },
  "gemini-3.5-flash": { in: 1.5, out: 9.0 },
  "gemini-3.1-flash-lite": { in: 0.25, out: 1.5 },
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

/** The default light model, offered when a Google key is present. */
export const DEFAULT_LIGHT_MODEL = "gemini-3.1-flash-lite";

/**
 * The model a call actually runs on.
 *
 * Light features fall back to the main model unless a light model is
 * configured *and* its provider has a key — a light model whose key is missing
 * would otherwise turn a working feature into an error.
 */
export function modelForCall(weight: ClaudeCallOptions["weight"]): string {
  const main = activeModel();
  if (weight !== "light") return main;
  let light: string | undefined;
  try {
    light = useStore.getState().aiConfig.lightModel;
  } catch {
    light = undefined;
  }
  if (!light || light === main) return main;
  return getApiKey(providerForModel(light)) ? light : main;
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
  /**
   * "light" routes to the configured light model when one is usable — small,
   * frequent features (digest, narration, Q&A) don't need the heavy model and
   * can ride a free tier while breakdowns keep the good one.
   */
  weight?: "heavy" | "light";
  /** Called when a call is parked waiting on the provider's rate limit. */
  onWait?: (seconds: number) => void;
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

// ------------------------------------------------------------
// Rate limiting
//
// Gemini's free tier allows roughly 10-15 requests/minute. A big script runs
// batches 3-wide and each can retry, which clears that on its own — and the
// 429s it earns come back as user-visible failures. A token bucket in front of
// every attempt keeps a long run inside the allowance instead.
// ------------------------------------------------------------

/** Requests per minute, by model. Paid providers get a generous ceiling. */
function rpmFor(model: string): number {
  const info = MODELS.find((m) => m.id === model);
  if (info?.freeTier) return model.includes("lite") ? 12 : 8;
  return providerForModel(model) === "google" ? 60 : 120;
}

class TokenBucket {
  private tokens: number;
  private last = Date.now();
  /** Serializes waiters so two callers can't spend the same token. */
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly ratePerMinute: number) {
    this.tokens = ratePerMinute;
  }

  private refill(): void {
    const now = Date.now();
    const gained = ((now - this.last) / 60_000) * this.ratePerMinute;
    if (gained > 0) {
      this.tokens = Math.min(this.ratePerMinute, this.tokens + gained);
      this.last = now;
    }
  }

  take(onWait?: (seconds: number) => void): Promise<void> {
    const next = this.queue.then(async () => {
      this.refill();
      if (this.tokens < 1) {
        const waitMs = ((1 - this.tokens) / this.ratePerMinute) * 60_000;
        onWait?.(Math.ceil(waitMs / 1000));
        await sleep(waitMs);
        this.refill();
      }
      this.tokens -= 1;
    });
    // Keep the chain alive even if a waiter's caller later rejects.
    this.queue = next.catch(() => undefined);
    return next;
  }
}

const buckets = new Map<string, TokenBucket>();

function rateLimiter(model: string): TokenBucket {
  // Keyed by model: the quota that bites is the free tier's, which is
  // per-model, and it's what a mixed heavy/light run needs kept apart.
  let bucket = buckets.get(model);
  if (!bucket) {
    bucket = new TokenBucket(rpmFor(model));
    buckets.set(model, bucket);
  }
  return bucket;
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
  // Gemini counts thinking against maxOutputTokens, so left at its default
  // (medium on Flash, high on Pro) a reply can be truncated before any text
  // lands. Ask for the least thinking each tier allows, mirroring the "low
  // effort" setting on the Claude path. Gemini 3 replaced the 2.5-era
  // thinkingBudget with thinkingLevel; sending both is a 400.
  const thinkingLevel = model.startsWith("gemini-3.1-pro") ? "low" : "minimal";
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
        thinkingConfig: { thinkingLevel },
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
  const model = modelForCall(opts.weight);
  const provider = providerForModel(model);
  const apiKey = getApiKey(provider);
  if (!apiKey) throw new ClaudeApiError("No API key set");
  const req =
    provider === "google"
      ? geminiRequest(opts, model, apiKey)
      : anthropicRequest(opts, model, apiKey);

  let lastError: ClaudeApiError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Concurrent batches + retries can outrun a free tier's per-minute
    // allowance on their own, so every attempt takes a token first.
    await rateLimiter(model).take(opts.onWait);

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
  const model = modelForCall(opts.weight);
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
 * With a key for the call's provider: live call (throws on failure — no silent
 * demo fallback). Without a key: demo mode.
 */
export async function callClaude(opts: ClaudeCallOptions, sceneCtx?: Scene): Promise<ClaudeResult> {
  if (getApiKey(providerForModel(modelForCall(opts.weight)))) return callLive(opts);
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
  /** One-sentence production synopsis. Absent in demo mode. */
  synopsis?: string;
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
    synopsis:
      typeof parsed?.synopsis === "string" && parsed.synopsis.trim()
        ? parsed.synopsis.trim()
        : undefined,
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
    synopsis: { type: "string" },
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
Also return "synopsis": one sentence describing what happens in the scene, written for a strip board — who is present, what they do, and what the scene needs from the unit. Never quote dialogue.
Be specific and thorough — this feeds a real production department. Only include cast members who actually appear in the scene being analyzed.
Use the character list you are given as the source of truth for cast naming: refer to each character by their canonical name even when the scene text uses a nickname, a description, or a dialogue cue variant.`;

export interface BreakdownContext {
  /** Character names detected across the whole screenplay (weak fallback). */
  characters?: string[];
  /** The AI character bible. Preferred over `characters` when present. */
  characterBible?: ScriptCharacter[];
  /** Project / production title for context. */
  projectName?: string;
  /** Called when a request is parked on the provider's rate limit. */
  onWait?: (seconds: number) => void;
}

/** The context block a breakdown request is prefixed with. */
function breakdownContextLines(ctx?: BreakdownContext): string[] {
  const lines: string[] = [];
  if (ctx?.projectName) lines.push(`PRODUCTION: ${ctx.projectName}`);
  // The bible knows aliases and who actually speaks; the bare name list is the
  // regex fallback and only used when there's no bible.
  if (ctx?.characterBible?.length) {
    lines.push(`CHARACTERS IN THIS SCREENPLAY:\n${describeCharacters(ctx.characterBible)}`);
  } else if (ctx?.characters?.length) {
    lines.push(`KNOWN CHARACTERS IN THIS SCREENPLAY: ${ctx.characters.join(", ")}`);
  }
  return lines;
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
  projectName?: string,
  onWait?: (seconds: number) => void
): Promise<{ characters: ScriptCharacter[]; result: ClaudeResult }> {
  const result = await callClaude({
    feature: "character_bible",
    system: CHARACTER_SYSTEM,
    user: `${projectName ? `PRODUCTION: ${projectName}\n\n` : ""}COMPLETE SCREENPLAY:\n\n${fullScript}`,
    maxTokens: 8000,
    jsonSchema: CHARACTER_SCHEMA,
    onWait,
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

// ============================================================
// LOCATION BIBLE — one pass over the whole screenplay
//
// The breakdown tags a `locations` element per scene, but nothing ever joins
// them up: "JOHN'S APARTMENT", "JOHN'S APARTMENT - KITCHEN" and "THE
// APARTMENT" stay three unrelated strings. A model reading every heading at
// once can collapse them into the one address a location manager would scout,
// which no per-scene pass can do. Costs one request per script.
// ============================================================

export const LOCATION_TYPES = ["INT", "EXT", "INT/EXT", "STAGE"] as const;

export interface ProposedLocation {
  name: string;
  aliases?: string[];
  type: ProductionLocation["type"];
  /** Scene numbers that play here, as the app knows them. */
  sceneNumbers?: string[];
  suggestedNotes?: string;
}

const LOCATION_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["locations"],
  properties: {
    locations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "type"],
        properties: {
          name: { type: "string" },
          aliases: { type: "array", items: { type: "string" } },
          type: { type: "string", enum: LOCATION_TYPES },
          sceneNumbers: { type: "array", items: { type: "string" } },
          suggestedNotes: { type: "string" },
        },
      },
    },
  },
};

const LOCATION_SYSTEM = `You are an experienced location manager consolidating a screenplay's scene headings into the real-world places a production must actually find, scout and secure.

Work from the whole script, not heading by heading:
- One entry per place a location manager would scout as a single unit. Rooms of one building are NOT separate locations: "JOHN'S APARTMENT - KITCHEN", "JOHN'S APARTMENT - HALLWAY" and "JOHN'S APARTMENT" are one location, and the sub-locations belong in suggestedNotes.
- Collect every other spelling the script uses for that place into aliases — abbreviations, "THE APARTMENT" after it was named once, and the sub-location headings themselves. Aliases are how the app links scenes to this record, so list every heading string that resolves here.
- type: INT for interiors, EXT for exteriors, INT/EXT when the place is shot both ways across the script, STAGE only when the scene demands something no practical location can give (a set that must be built, a location that cannot exist).
- sceneNumbers: every scene that plays here, using the exact scene numbers you were given.
- suggestedNotes: what this place demands of the unit, drawn from what the scenes actually do — sub-locations, parking and unit basing, power, permits and road closures, sound problems, night work, crowd control, water/height/animal safety. Be concrete and short. Do not invent requirements the script gives no basis for.

Use the exact heading strings you are given as your source of truth. Prefer the fullest, most specific spelling as the canonical name.`;

/**
 * One request over the full screenplay. Throws on live-API failure.
 * `sceneHeadings` anchors the model to the exact strings the app parsed, so
 * aliases come back matchable rather than paraphrased.
 */
export async function aiLocationBible(
  fullScript: string,
  sceneHeadings: string[],
  projectName?: string,
  onWait?: (seconds: number) => void
): Promise<{ locations: ProposedLocation[]; result: ClaudeResult }> {
  const result = await callClaude({
    feature: "location_bible",
    onWait,
    system: LOCATION_SYSTEM,
    user: `${projectName ? `PRODUCTION: ${projectName}\n\n` : ""}SCENE HEADINGS AS PARSED (use these exact strings):\n${sceneHeadings.join(
      "\n"
    )}\n\nCOMPLETE SCREENPLAY:\n\n${fullScript}`,
    maxTokens: 6000,
    jsonSchema: LOCATION_SCHEMA,
  });

  let locations: ProposedLocation[] = [];
  try {
    const parsed = JSON.parse(extractJson(result.text));
    locations = Array.isArray(parsed.locations)
      ? parsed.locations
          .filter((l: ProposedLocation) => l && l.name)
          .map((l: ProposedLocation) => ({
            name: String(l.name).trim(),
            aliases: Array.isArray(l.aliases)
              ? l.aliases.map(String).filter(Boolean)
              : undefined,
            type: (LOCATION_TYPES as readonly string[]).includes(l.type) ? l.type : "INT",
            sceneNumbers: Array.isArray(l.sceneNumbers) ? l.sceneNumbers.map(String) : undefined,
            suggestedNotes: l.suggestedNotes ? String(l.suggestedNotes) : undefined,
          }))
      : [];
  } catch {
    if (!result.fromMock) throw new ClaudeApiError("Could not parse the location list as JSON.");
  }
  return { locations, result };
}

/**
 * Deterministic consolidation used in demo mode and whenever the AI pass
 * fails. Groups headings by the part before the first " - ", which is the
 * convention sub-locations follow, so "X - KITCHEN" and "X - HALL" collapse
 * into X. Weaker than the model — it can't spot that "THE APARTMENT" is also
 * X — but it beats leaving the Locations page empty.
 */
export function fallbackLocations(scenes: Scene[]): ProposedLocation[] {
  const groups = new Map<
    string,
    { name: string; aliases: Set<string>; types: Set<string>; scenes: string[]; subs: Set<string> }
  >();

  for (const s of scenes) {
    const raw = s.location.trim();
    if (!raw) continue;
    const [head, ...rest] = raw.split(/\s+-\s+/);
    const base = (head || raw).trim();
    const key = base.toLowerCase();
    let g = groups.get(key);
    if (!g) {
      g = { name: base, aliases: new Set(), types: new Set(), scenes: [], subs: new Set() };
      groups.set(key, g);
    }
    if (raw.toLowerCase() !== key) g.aliases.add(raw);
    if (rest.length) g.subs.add(rest.join(" - "));
    g.types.add(s.intExt);
    g.scenes.push(s.number);
  }

  return [...groups.values()].map((g) => ({
    name: g.name,
    aliases: g.aliases.size ? [...g.aliases] : undefined,
    type: g.types.size > 1 ? "INT/EXT" : ((g.types.values().next().value ?? "INT") as ProductionLocation["type"]),
    sceneNumbers: g.scenes,
    suggestedNotes: g.subs.size ? `Sub-locations: ${[...g.subs].join(", ")}.` : undefined,
  }));
}

/** Break down a single scene. Returns the parsed proposal + usage. Throws on live-API failure. */
export async function aiBreakdownScene(
  scene: Scene,
  ctx?: BreakdownContext
): Promise<{
  proposal: SceneBreakdownProposal;
  result: ClaudeResult;
}> {
  const contextLines = breakdownContextLines(ctx);

  const result = await callClaude(
    {
      feature: "script_breakdown",
      system: BREAKDOWN_SYSTEM,
      user: `${contextLines.length ? contextLines.join("\n\n") + "\n\n" : ""}SCENE ${scene.number} — ${scene.intExt}. ${scene.location} — ${scene.timeOfDay}\n\n${scene.scriptText || scene.synopsis}`,
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
          synopsis: { type: "string" },
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
  ctx?: BreakdownContext
): Promise<{ proposals: Map<string, SceneBreakdownProposal>; result: ClaudeResult }> {
  const contextLines = breakdownContextLines(ctx);

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
      onWait: ctx?.onWait,
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

// ============================================================
// TASK PROPOSALS — one request per run
//
// Sends a digest of what the breakdown found (elements by department and
// scene), the shoot-day list, and the tasks that already exist, and asks for
// prep tasks anchored to real deadline rules. Every proposed rule is validated
// against the same evaluator the app uses before the user ever sees it.
// ============================================================

export const TASK_PRIORITIES = ["low", "medium", "high", "critical"] as const;

export interface ProposedTask {
  title: string;
  department: DepartmentId;
  priority: TaskPriority;
  /** Scene number, as shown to the model. */
  linkedScene?: string;
  deadlineRule: string;
  notes?: string;
}

/** Cap on how many proposals a run may return — a reviewable list, not a dump. */
export const MAX_TASK_PROPOSALS = 40;

const TASK_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["tasks"],
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "department", "priority", "deadlineRule"],
        properties: {
          title: { type: "string" },
          department: { type: "string", enum: DEPARTMENT_IDS },
          priority: { type: "string", enum: TASK_PRIORITIES },
          linkedScene: { type: "string" },
          deadlineRule: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
  },
};

const TASK_SYSTEM = `You are a line producer turning a script breakdown into the prep tasks each department must complete before the camera rolls.

Rules:
- Propose work that the breakdown data actually implies. Every task must trace to an element, a scene, or a shoot day you were given. Do not invent departments' generic housekeeping.
- Every task needs a deadline expressed in this exact grammar, and nothing else:
    shoot_day(N) - 3d      (N is a real day number from the shoot-day list)
    shoot_day(N) + 1d
    location_lock(NAME) - 7d   (NAME must be a location name you were given)
    manual(YYYY-MM-DD)
  Anchor to shoot_day for work that must land before a scene shoots, and to location_lock for work that can't start until a place is secured. Use manual() only when neither applies.
- Lead times must be real: a permit is weeks, a fitting is days, a haircut is the day before. Set the offset from what the work takes, not a default.
- One task per real unit of work. Do not emit one task per element — group them ("Source 6 hero props for the diner scenes" beats six tasks).
- Do not duplicate or restate a task that already exists. You are given the current task titles.
- priority: critical only when the shoot day cannot happen without it.
- Return at most ${MAX_TASK_PROPOSALS} tasks, the most consequential first.`;

/** One request. Throws on live-API failure. */
export async function aiTaskProposals(
  digest: string,
  projectName?: string,
  onWait?: (seconds: number) => void
): Promise<{ tasks: ProposedTask[]; result: ClaudeResult }> {
  const result = await callClaude({
    feature: "task_proposals",
    system: TASK_SYSTEM,
    user: `${projectName ? `PRODUCTION: ${projectName}\n\n` : ""}${digest}`,
    maxTokens: 6000,
    jsonSchema: TASK_SCHEMA,
    onWait,
  });

  let tasks: ProposedTask[] = [];
  try {
    const parsed = JSON.parse(extractJson(result.text));
    tasks = Array.isArray(parsed.tasks)
      ? parsed.tasks
          .filter((t: ProposedTask) => t && t.title && t.deadlineRule)
          .map((t: ProposedTask) => ({
            title: String(t.title).trim(),
            department: (DEPARTMENT_IDS as readonly string[]).includes(t.department)
              ? t.department
              : ("production" as DepartmentId),
            priority: (TASK_PRIORITIES as readonly string[]).includes(t.priority)
              ? t.priority
              : ("medium" as TaskPriority),
            linkedScene: t.linkedScene ? String(t.linkedScene).trim() : undefined,
            deadlineRule: String(t.deadlineRule).trim(),
            notes: t.notes ? String(t.notes) : undefined,
          }))
          .slice(0, MAX_TASK_PROPOSALS)
      : [];
  } catch {
    if (!result.fromMock) throw new ClaudeApiError("Could not parse the task list as JSON.");
  }
  return { tasks, result };
}

// ============================================================
// REPORT NARRATION — the cheapest call in the app
// ============================================================

const NARRATION_SYSTEM = `You are a line producer writing the executive summary that sits at the top of a production report.

Write 3-5 sentences of plain prose — no bullets, no headings, no preamble.
- Every number you state must come from the table you were given. Never estimate, extrapolate, or invent a figure.
- Lead with the totals that matter, then the outliers, then the risks a producer should act on.
- Point at specific rows: name the scene, day, department or account that drives what you're describing.
- If the table is too thin to support a claim, say what it shows and stop. Do not pad.`;

/** Rows are capped so a large report stays one small request. */
export const NARRATION_ROW_CAP = 80;

/** One tiny request. Throws on live-API failure. */
export async function aiNarrateReport(
  title: string,
  columns: string[],
  rows: string[][],
  projectName?: string
): Promise<{ narration: string; result: ClaudeResult; truncated: boolean }> {
  const shown = rows.slice(0, NARRATION_ROW_CAP);
  const truncated = rows.length > shown.length;
  const csv = [columns, ...shown].map((r) => r.join(" | ")).join("\n");

  const result = await callClaude({
    feature: "report_narration",
    weight: "light",
    system: NARRATION_SYSTEM,
    user: `${projectName ? `PRODUCTION: ${projectName}\n` : ""}REPORT: ${title}\n${
      truncated
        ? `\nNOTE: showing the first ${shown.length} of ${rows.length} rows. Do not state totals as if they cover every row.\n`
        : ""
    }\n${csv}`,
    maxTokens: 500,
  });

  const narration = result.fromMock
    ? demoNarration(title, columns, rows)
    : result.text.trim();
  return { narration, result, truncated };
}

/** No key: state what the table is, honestly, and claim nothing more. */
export function demoNarration(title: string, columns: string[], rows: string[][]): string {
  const numericCols = columns
    .map((c, i) => ({ c, i }))
    .filter(({ i }) =>
      rows.some((r) => r[i] && /^[^a-z]*\d[\d.,]*[^a-z]*$/i.test(r[i].trim()))
    );
  const bits = [
    `${title}: ${rows.length} row${rows.length === 1 ? "" : "s"} across ${columns.length} columns.`,
  ];
  if (numericCols.length) {
    bits.push(
      `Numeric columns available for analysis: ${numericCols.map((n) => n.c).join(", ")}.`
    );
  }
  bits.push(
    "This is demo mode — no summary was generated. Add a Claude or Gemini API key in AI Settings for a written narration."
  );
  return bits.join(" ");
}

// ============================================================
// SCHEDULE DRAFT — one request, a whole strip board
// ============================================================

export interface ProposedDay {
  dayNumber: number;
  date: string; // YYYY-MM-DD
  location: string;
  sceneNumbers: string[];
  estimatedHours: number;
  rationale?: string;
}

const SCHEDULE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["days"],
  properties: {
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dayNumber", "date", "location", "sceneNumbers", "estimatedHours"],
        properties: {
          dayNumber: { type: "number" },
          date: { type: "string" },
          location: { type: "string" },
          sceneNumbers: { type: "array", items: { type: "string" } },
          estimatedHours: { type: "number" },
          rationale: { type: "string" },
        },
      },
    },
  },
};

const SCHEDULE_SYSTEM = `You are a 1st AD building a shooting schedule — a strip board — from a scene list.

How a real board is built, in priority order:
1. Group by location. Company moves cost hours; every scene at one location should shoot together unless something forces otherwise. This dominates everything below.
2. Keep night work contiguous. Batch night scenes into consecutive nights so the unit turns around once, not repeatedly. Never mix a day exterior and a night exterior on the same day.
3. Respect the page target. Each day should land near the target pages given; a day well over it will not make its day.
4. Front-load heavy-cast and heavy-build scenes — they have the least slack if they slip.
5. Shoot exteriors before interiors at a location when weather could cost you the day.

Rules for the output:
- Use only the scene numbers you are given, exactly as given. Every scene appears at most once. It is fine to leave scenes unplaced — a short honest board beats a full invented one.
- dayNumber starts at 1 and increases by 1 with no gaps.
- date: consecutive shooting days from the start date given, Monday-Friday only. Skip weekends.
- location: the canonical location name for that day's scenes.
- estimatedHours: what the day realistically takes, from page count and what the scenes demand. A 12-hour day is standard; more than 14 is a red flag.
- rationale: one short sentence on why these scenes are together on this day.`;

/** One request over the whole scene list. Throws on live-API failure. */
export async function aiScheduleDraft(
  digest: string,
  projectName?: string
): Promise<{ days: ProposedDay[]; result: ClaudeResult }> {
  const result = await callClaude({
    feature: "schedule_draft",
    system: SCHEDULE_SYSTEM,
    user: `${projectName ? `PRODUCTION: ${projectName}\n\n` : ""}${digest}`,
    maxTokens: 8000,
    jsonSchema: SCHEDULE_SCHEMA,
  });

  let days: ProposedDay[] = [];
  try {
    const parsed = JSON.parse(extractJson(result.text));
    days = Array.isArray(parsed.days)
      ? parsed.days
          .filter((d: ProposedDay) => d && Array.isArray(d.sceneNumbers))
          .map((d: ProposedDay) => ({
            dayNumber: Number(d.dayNumber),
            date: String(d.date ?? "").slice(0, 10),
            location: String(d.location ?? "").trim(),
            sceneNumbers: d.sceneNumbers.map(String),
            estimatedHours: Number(d.estimatedHours) || 12,
            rationale: d.rationale ? String(d.rationale) : undefined,
          }))
      : [];
  } catch {
    if (!result.fromMock) throw new ClaudeApiError("Could not parse the schedule as JSON.");
  }
  return { days, result };
}

// ============================================================
// DAILY DIGEST
// ============================================================

const DIGEST_SYSTEM = `You are a production analyst writing the morning digest for the Production Manager.

Return 4-6 bullets, one line each, starting with "- ". No preamble, no closing summary.
- Rank by urgency: what will hurt the production soonest goes first.
- Every bullet must cite the number it's about, taken from the state you were given. Never state a figure that isn't there.
- Where a field says "not tracked" or "none", that is the fact. Do not treat it as zero, do not infer a value, and do not invent a trend — you are given one snapshot, not a history.
- Say what to do about it, briefly, when the data makes the action obvious.
- If the production is genuinely quiet, say so in fewer bullets rather than padding.`;

/** One small request. Throws on live-API failure. */
export async function aiDailyDigest(
  stateText: string
): Promise<{ digest: string; result: ClaudeResult }> {
  const result = await callClaude({
    feature: "daily_digest",
    weight: "light",
    system: DIGEST_SYSTEM,
    user: `CURRENT PRODUCTION STATE:\n${stateText}`,
    maxTokens: 600,
  });
  return { digest: result.text.trim(), result };
}

/**
 * No key: restate the state that matters, without pretending to have reasoned
 * about it. Every line is a fact already computed upstream.
 */
export function demoDigest(stateText: string): string {
  const keep = stateText
    .split("\n")
    .filter((l) => /^(SCHEDULE|PAGES|BUDGET|OVERDUE TASKS|PENDING POs|CAST CONFLICTS):/.test(l))
    .map((l) => `- ${l}`);
  return [
    ...keep,
    "- Demo mode: these are the raw figures, not an AI analysis. Add a Claude or Gemini API key in AI Settings for a written digest.",
  ].join("\n");
}

// ============================================================
// ASK THE PRODUCTION — natural-language query over a data snapshot
// ============================================================

const NL_QUERY_SYSTEM = `You are answering questions about a film production from its live data. You are talking to the crew who own this production.

- Answer only from the JSON you are given. It is the whole of what you know.
- Cite the specifics: scene numbers, day numbers, dates, character names, account codes. A producer needs to go check.
- If the data cannot answer the question, say "That isn't tracked in the production data" and name what would need to be filled in. Never guess, never estimate, never fill a gap from what a typical production would look like.
- If a section was omitted from the snapshot (see "_omitted"), say the data exists but wasn't loaded rather than treating it as empty.
- Be brief: a couple of sentences, or a short list when the answer is genuinely a list. No preamble.`;

/** One request per question, plain text out. Throws on live-API failure. */
export async function aiAskProduction(
  question: string,
  snapshotJson: string,
  projectName?: string
): Promise<{ answer: string; result: ClaudeResult }> {
  const result = await callClaude({
    feature: "nl_query",
    weight: "light",
    system: NL_QUERY_SYSTEM,
    user: `${projectName ? `PRODUCTION: ${projectName}\n\n` : ""}PRODUCTION DATA:\n${snapshotJson}\n\nQUESTION: ${question}`,
    maxTokens: 700,
  });
  return { answer: result.text.trim(), result };
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
