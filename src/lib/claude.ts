// ============================================================
// AI API WRAPPER — SceneTrackable
// Browser-direct calls to one provider: Z.ai's GLM. The key and model
// are fixed here, so there is nothing to configure and every feature
// works out of the box. Live calls retry on transient errors and never
// silently degrade to demo output — failures surface to the caller.
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
import { detectLanguage, languageDirective, type ScriptLanguage } from "@/lib/lang";

/** Departments, as a schema enum. */
const DEPARTMENT_IDS = DEPARTMENTS as readonly string[];

// Re-exported so call sites can keep importing the AI vocabulary from here.
export type { CharacterImportance, ScriptCharacter };

const GLM_URL = "https://api.z.ai/api/paas/v4/chat/completions";

export const PROVIDER_LABEL = "Z.ai GLM";

/**
 * The only model the app calls.
 *
 * Not a free choice: this account has no balance, and every billed id
 * (glm-4.7, glm-5.2, even glm-4.5-air) answers with error 1113 before it ever
 * routes to a model. glm-4.7-flash is served free and is the one id that
 * actually returns completions. It is absent from the `/models` listing, so
 * trust this constant over that endpoint.
 */
export const MODEL = "glm-4.7-flash";

/**
 * Hardcoded so the app works with nothing to configure.
 *
 * This ships in the client bundle, which means anyone using the app can read
 * it — it is a free-tier key and is treated as public.
 */
const API_KEY = "bcbdd5739b944792a63556ddf95ac28b.zhXllGiawEcLj9Xm";

/** glm-4.7-flash is free. Tokens are still metered so usage stays visible. */
export function estimateCost(_inputTokens: number, _outputTokens: number, _model?: string): number {
  return 0;
}

/** Retained so call sites that gate on "is AI configured" keep reading true. */
export function hasApiKey(): boolean {
  return true;
}

/** Every call runs on the one model; weight no longer routes anywhere. */
export function modelForCall(_weight?: ClaudeCallOptions["weight"]): string {
  return MODEL;
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
  /**
   * The language the answer must be written in. Defaults to the language of
   * `user`, which is right whenever that text is the script itself. Set it
   * explicitly when the material and the question can differ (Q&A: an Arabic
   * question over a snapshot of English data, or the reverse).
   */
  language?: ScriptLanguage;
}

export interface ClaudeResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
  fromMock: boolean;
}

const MAX_ATTEMPTS = 5;
const RETRYABLE_STATUS = new Set([429, 500, 503, 529]);

/**
 * GLM reports billing and quota faults as error codes in a 200-shaped body or
 * behind a 4xx, not as a distinct status. Code 1113 ("insufficient balance") is
 * an account state, not a blip: it fails identically on every retry, so detect
 * it and stop rather than spending a minute of backoff to arrive at the same
 * place. 1211 means the model id doesn't exist — equally permanent.
 */
function permanentFailure(body: string): boolean {
  return /"code"\s*:\s*"?(1113|1211|1002|1004)"?/.test(body);
}

/** Turn a GLM error body into something a producer can act on. */
function errorMessage(status: number, body: string): string {
  if (/"code"\s*:\s*"?1113"?/.test(body)) {
    return `The GLM account has no balance, so ${MODEL} was refused (1113). ${MODEL} is normally free — if this appears, the free allowance is exhausted or the key was disabled.`;
  }
  if (/"code"\s*:\s*"?1211"?/.test(body)) {
    return `GLM does not recognise the model "${MODEL}" (1211).`;
  }
  if (/"code"\s*:\s*"?(1002|1004)"?/.test(body)) {
    return `The GLM API key was rejected (authentication failed).`;
  }
  if (status === 429 || /"code"\s*:\s*"?1302"?/.test(body)) {
    return `${MODEL} is rate-limited right now — the free tier allows a limited number of requests per minute. The run will retry automatically.`;
  }
  return `${PROVIDER_LABEL} API error ${status} — ${body.slice(0, 200)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ------------------------------------------------------------
// Rate limiting
//
// A big script runs batches 3-wide and each can retry, which can outrun a free
// tier's allowance on its own — and the 429s it earns come back as
// user-visible failures. A token bucket in front of every attempt keeps a long
// run inside the allowance instead.
// ------------------------------------------------------------

/**
 * Requests per minute.
 *
 * Deliberately conservative. GLM does not publish the free tier's rate, and it
 * answers an overrun with 1302 — which back-to-back breakdown runs hit for
 * real. A breakdown is only a handful of requests (one per 10-scene batch,
 * plus the two bibles), so pacing them costs seconds and buys reliability.
 */
const RPM = 15;

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

/** One bucket: there is one model, so one allowance to protect. */
const limiter = new TokenBucket(RPM);

/**
 * GLM ignores `response_format: json_schema` — it accepts the field and then
 * answers with prose or a fenced block anyway. `json_object` is honoured, so
 * that is what forces JSON; the schema itself has to travel in the prompt for
 * the model to know the shape. `extractJson` handles a fence either way.
 *
 * The wording earns its length. Appended to a long system prompt with a bare
 * "match this schema", the model echoed the schema back as its answer — valid
 * JSON, zero data, and no parse error to catch it. It goes last in the user
 * turn (nearest the text being analysed) and says outright which of the two
 * objects to return.
 */
function jsonInstruction(schema: Record<string, unknown>): string {
  return `\n\nRespond with a single JSON object that conforms to the JSON Schema below.
Return the DATA — an instance of the schema, populated from the material above.
Do NOT return, repeat, or echo the schema document itself.
No prose, no markdown fence, no commentary.

SCHEMA:
${JSON.stringify(schema)}`;
}

/** Highest max_tokens glm-4.7-flash accepts. */
const MAX_OUTPUT_TOKENS = 65536;

/**
 * Callers size `maxTokens` for the answer alone. GLM bills reasoning against
 * the same ceiling, so passing that number straight through spends the budget
 * on thinking and truncates the JSON — a 2-scene batch came back with 1 scene
 * and no error. Give reasoning its own allowance on top.
 */
function tokenBudget(opts: ClaudeCallOptions): number {
  const answer = opts.maxTokens ?? 1200;
  if (opts.weight === "light") return answer;
  return Math.min(MAX_OUTPUT_TOKENS, answer * 2 + 2000);
}

function glmBody(opts: ClaudeCallOptions): string {
  // Every feature reads script-derived text, so the directive is resolved here
  // rather than baked into each system prompt — a new prompt then can't forget
  // it, and Arabic support can't regress one feature at a time.
  const language = opts.language ?? detectLanguage(opts.user);

  return JSON.stringify({
    model: MODEL,
    // Light features disable reasoning; the analytical ones keep it — with it
    // off, the character pass silently drops non-speaking roles it otherwise
    // catches.
    thinking: { type: opts.weight === "light" ? "disabled" : "enabled" },
    max_tokens: tokenBudget(opts),
    messages: [
      { role: "system", content: opts.system + languageDirective(language) },
      {
        role: "user",
        content: opts.user + (opts.jsonSchema ? jsonInstruction(opts.jsonSchema) : ""),
      },
    ],
    ...(opts.jsonSchema ? { response_format: { type: "json_object" } } : {}),
  });
}

async function callLive(opts: ClaudeCallOptions): Promise<ClaudeResult> {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
  };
  const body = glmBody(opts);

  let lastError: ClaudeApiError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Concurrent batches + retries can outrun a free tier's per-minute
    // allowance on their own, so every attempt takes a token first.
    await limiter.take(opts.onWait);

    let res: Response;
    try {
      res = await fetch(GLM_URL, { method: "POST", headers, body });
    } catch (e) {
      // Network failure — retryable.
      lastError = new ClaudeApiError(`Network error: ${(e as Error).message}`);
      await sleep(1000 * 2 ** attempt + Math.random() * 400);
      continue;
    }

    const raw = await res.text();

    // GLM returns billing/auth faults as an error code inside a 200 body as
    // readily as behind a 4xx, so the code is checked before the status.
    if (permanentFailure(raw)) {
      throw new ClaudeApiError(errorMessage(res.status, raw), res.status);
    }

    if (res.ok && !/"error"\s*:/.test(raw)) {
      const data = JSON.parse(raw);
      const choice = data.choices?.[0];

      // Truncation is the quiet failure: cut JSON can still parse into a
      // partial answer, so a 10-scene batch returns 4 scenes and reports
      // success. Never let that reach the caller as a result.
      if (choice?.finish_reason === "length") {
        throw new ClaudeApiError(
          `${MODEL} ran out of output budget and the reply was cut off. The answer would have been incomplete, so it was rejected rather than returned in part.`
        );
      }

      return {
        text: choice?.message?.content || "",
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        costUsd: 0,
        model: MODEL,
        fromMock: false,
      };
    }

    lastError = new ClaudeApiError(errorMessage(res.status, raw), res.status);
    if (res.ok || !RETRYABLE_STATUS.has(res.status)) throw lastError;

    const retryAfter = Number(res.headers.get("retry-after"));
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 1000 * 2 ** attempt + Math.random() * 400;
    await sleep(backoff);
  }

  throw lastError ?? new ClaudeApiError(`${PROVIDER_LABEL} API call failed`);
}

/**
 * Always a live call — the key is compiled in, so there is no keyless demo
 * mode left to fall back to. Throws on failure rather than degrading silently.
 *
 * `_sceneCtx` is what demo mode synthesized a plausible breakdown from. It is
 * kept so call sites read unchanged, and ignored.
 */
export async function callClaude(opts: ClaudeCallOptions, _sceneCtx?: Scene): Promise<ClaudeResult> {
  return callLive(opts);
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
"estimated_duration_minutes" is how long the unit needs to SHOOT the scene on the day — setup, rehearsal, coverage and resets — not how long it runs on screen. A page of dialogue is roughly 45-60 minutes of shooting; stunts, effects, crowds and night exteriors take longer. It is never less than 15.
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
    // A model that echoes the schema back parses fine and yields nothing. An
    // empty cast is never a correct answer for a screenplay, so treat a
    // missing array as the failure it is rather than importing zero characters.
    if (!Array.isArray(parsed?.characters)) {
      throw new ClaudeApiError("The character list came back in an unexpected shape.");
    }
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
  } catch (e) {
    // A shape error already says what went wrong; don't relabel it as a parse
    // failure, because the JSON parsed perfectly well.
    if (e instanceof ClaudeApiError) throw e;
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
 * Resolve the model's `scene_number` back to a real scene.
 *
 * Asked for "1" the model reliably answers "SCENE 1" — it reads the heading
 * it was shown rather than the bare number. Match exactly first, then retry
 * against the decoration it actually adds, so a cosmetic difference doesn't
 * throw away a scene's whole breakdown.
 */
function matchScene(raw: string, scenes: Scene[]): Scene | undefined {
  const num = raw.trim();
  if (!num) return undefined;
  const exact = scenes.find((s) => s.number === num);
  if (exact) return exact;
  const bare = num.replace(/^scene\s+/i, "").replace(/[.:]$/, "").trim().toLowerCase();
  return scenes.find((s) => s.number.trim().toLowerCase() === bare);
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
        const scene = matchScene(String(entry?.scene_number ?? ""), scenes);
        // Key by the app's own scene number, never the model's spelling of it:
        // a proposal filed under "SCENE 1" is invisible to a caller looking up
        // "1", which loses the whole batch while looking like a success.
        if (scene) proposals.set(scene.number, normalizeProposal(entry, scene));
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
    // The snapshot dwarfs the question and its keys are always English, so
    // detecting over the whole turn would answer an Arabic question in
    // English. Reply in whatever language the crew member asked in.
    language: detectLanguage(question),
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
