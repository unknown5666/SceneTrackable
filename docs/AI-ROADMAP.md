# SceneTrackable — AI & Improvement Roadmap

Each numbered **work order (WO)** below is written as a self-contained brief you can paste
into a Claude Code session. Paste the **Conventions** section together with whichever WO
you're running — it carries the project rules every change must follow.

Suggested order: WO-1 → WO-2 → WO-3 are the highest-impact (they fix the "no way to
populate places" gap and stop throwing away data the AI already produces). WO-4/5/6
finish the three AI features that are declared in the code but never implemented.
The rest are ranked quality/wow features.

---

## Conventions (paste with every WO)

Stack: Vite + React + TS + Tailwind + Zustand (single store, `src/state/store.ts`,
persisted to localStorage key `scenetrackable-v1`). The active project's data lives at
the top level of the store; `blankData()` in `store.ts` is the source of truth for what
counts as project data (`DATA_KEYS` is derived from it, and `captureActive` snapshots by
those keys). Cloud sync (`src/lib/cloud.ts`) serializes the whole persisted state, so new
top-level collections sync automatically — no cloud changes needed.

AI layer rules (`src/lib/claude.ts`):
- All AI calls go through `callClaude({ system, user, maxTokens, feature, jsonSchema })`.
  It returns `{ text, inputTokens, outputTokens, costUsd, model, fromMock }`. With no API
  key it returns demo output (`fromMock: true`); with a key it throws `ClaudeApiError` on
  failure — never silently degrade a live call to demo output.
- Provider is **derived from the model id** (`providerForModel`: `gemini*` → google,
  otherwise anthropic). Never introduce a separate provider setting.
- Never send `temperature` / `top_p` / `budget_tokens` to the Anthropic path (400s on
  Opus 4.8 / Sonnet 5). Gemini's `responseSchema` cannot contain `additionalProperties`
  (`toGeminiSchema` strips it — keep writing schemas Anthropic-style and let it strip).
- Always pass a `jsonSchema` for structured output, and still parse defensively with
  `extractJson()` before `JSON.parse` (models occasionally wrap JSON in prose).
- Every call site must record usage:
  `recordAIUsage({ feature, inputTokens, outputTokens, model, costUsd })` (store action).
- New feature ids must be added to the `AIFeature` union in `src/types/index.ts` **and**
  to `FEATURE_LABELS` + the cost-estimate table in `src/pages/AISettings.tsx`.
- Demo mode: every new AI feature needs a plausible non-AI fallback in
  `callClaudeMock` (or at the call site) so the app remains fully usable with no key.

Free-tier design rules (the app's free path is Gemini 2.5 Flash / Flash Lite,
`freeTier: true` in `MODELS`):
- Free-tier limits are roughly ~10–15 requests/min and a few hundred requests/day
  (Flash Lite allows more than Flash). Design features as **one request per action**, or
  batched like `aiBreakdownBatch` (10 scenes/request, 3 concurrent). Never fire one
  request per row/scene/task.
- Google trains on free-tier prompts — the app already warns about this in AI Settings;
  keep that warning wherever new features send script content.

Data / UX rules:
- Every mutation logs to the activity log via `logActivity` (see `createTask` in
  `store.ts` for the pattern).
- New editable collections use the schema-driven system: add the collection to
  `ProductionData` (`src/types/index.ts`), to `blankData()` (`src/state/store.ts`), to
  `RecordCollection` + `SCHEMAS` (`src/data/schemas.ts`), and render with
  `useRecordEditor` (`src/components/ui/RecordEditor.tsx`). The compile-time guard at the
  bottom of `schemas.ts` enforces the `ProductionData` key.
- New pages need: a route in `src/App.tsx`, a nav item in
  `src/components/layout/Sidebar.tsx`, and an access key in `ACCESS_KEYS` +
  relevant `DEFAULT_ROLES` in `src/data/roles.ts`.
- AI-generated records are always **proposals the user reviews and accepts**, never
  silent writes. Follow the Breakdown page's pattern: show what will be created, let the
  user deselect, then commit. Mark records with `createdByAI: true` where the type has it.
- After any change: `npx tsc --noEmit` and `npm run build` must pass.

---

## Phase 1 — Locations become real (the missing feature)

### WO-1 · First-class Locations collection + Locations page

**Problem.** Location dropdowns (`combo` fields with `optionsFrom: "locations"`) read
from `useLocationNames()` (`src/lib/locations.ts`), which only *derives* names from
scenes, shoot days, and `locationLockDates`. There is **no way to add, edit, or describe
a location directly** — a location can't exist before a scene mentions it, has no
address, contact, permit status, or notes, and lock dates (`setLocationLock` in
`store.ts`) have no UI at all even though the task deadline rule
`location_lock(NAME) + 2d` (`src/lib/deadlines.ts`) depends on them.

**Build:**

1. New type in `src/types/index.ts`:

```ts
export type LocationPermitStatus = "scouting" | "optioned" | "permit_pending" | "locked" | "wrapped";

export interface ProductionLocation {
  id: string;
  name: string;              // canonical name used in scene headings
  aliases?: string[];        // other spellings that appear in the script
  type: "INT" | "EXT" | "INT/EXT" | "STAGE";
  address?: string;
  contactName?: string;
  contactPhone?: string;
  permitStatus: LocationPermitStatus;
  lockDate?: string;         // ISO — replaces locationLockDates entries
  parkingNotes?: string;
  powerNotes?: string;
  costPerDay?: number;
  notes?: string;
  createdByAI?: boolean;
}
```

2. Add `locations: ProductionLocation[]` to `ProductionData`, `blankData()`, and a new
   `"location"` entry to the `ActivityEntity` union.
3. Add `"locations"` to `RecordCollection` and a `SCHEMAS.locations` entry in
   `src/data/schemas.ts` (fields per the type above; `permitStatus` a select with
   default `"scouting"`; `aliases` as `tags`; `notes`/`parkingNotes` textarea, wide).
4. New page `src/pages/Locations.tsx` using `useRecordEditor("locations")`: a table of
   locations (name, type, permit status badge, lock date, scene count) with add/edit/
   delete. Scene count = scenes whose `location` matches name or an alias
   (case-insensitive, trimmed). Clicking a row could expand to show its scenes.
   Route `/locations`, Sidebar item (icon `MapPin`), `ACCESS_KEYS` key `"locations"`,
   granted to `scheduler` and `admin` (and add to the `rf_comms` role, which coordinates
   by location).
5. **Lock-date integration:** `lockDate` on the record becomes the source for
   `location_lock(...)` deadline rules. Update `recomputeAllDeadlines` /
   `evaluateDeadline` context to read lock dates from the `locations` collection first
   and fall back to legacy `locationLockDates`. When a `lockDate` is set/changed, call
   `recomputeAllDeadlines()` and log activity. Add a one-time migration in the store
   (or on rehydrate) that converts existing `locationLockDates` entries into
   `ProductionLocation` records so no data is stranded.
6. `useLocationNames()` must now include the `locations` collection (canonical names
   first), still de-duplicated with the derived scene/shoot-day names so nothing breaks.
7. Reports: add a "Location Report" to `src/lib/reports.ts` — one row per location:
   name, type, permit status, lock date, #scenes, script days (unique shoot days), cost.

**Acceptance:** a location can be created before any scene exists; it appears in every
location dropdown; setting its lock date moves `location_lock` task deadlines; the old
`locationLockDates` data still resolves.

---

### WO-2 · AI Location Bible — auto-populate locations from the script (free-tier: 1 request)

**Problem.** The breakdown already extracts per-scene `locations` elements, but nothing
aggregates them: "JOHN'S APARTMENT", "JOHN'S APARTMENT - KITCHEN" and "THE APARTMENT"
stay three unrelated strings. This is the "populate places" gap: after a script upload,
the Locations page should be full.

**Build:** mirror the character-bible pattern (`aiCharacterBible` in `src/lib/claude.ts`
and its use in `runBreakdown`, `src/lib/script.ts`).

1. New `AIFeature`: `"location_bible"` (types + AISettings labels/costs table —
   avgIn ~40000 / avgOut ~2500, "per script").
2. `aiLocationBible(fullScript, sceneHeadings, projectName)` in `claude.ts`: **one
   request** over the whole script. System prompt: an experienced location manager
   consolidating a screenplay's scene headings into real-world locations to scout —
   collapse sub-locations of one address into a single location with the sublocations
   listed in notes, resolve aliases, classify INT/EXT/STAGE candidates, and suggest
   practical requirements (parking, power, permits, sound issues) from what the scenes
   demand. JSON schema: `{ locations: [{ name, aliases, type, sceneNumbers, suggestedNotes }] }`.
   Include the parsed scene headings list in the user message so the model anchors to the
   exact strings the app knows.
3. Wire into `runBreakdown` as a third pass (after the character pass, in parallel with
   scene batches is fine — it's independent). On failure, fall back to a deterministic
   grouping: unique `scene.location` strings with common sub-location suffixes
   (`" - KITCHEN"` etc.) grouped by prefix. Demo mode uses only the fallback.
4. After a breakdown run, propose the locations in the results modal (Projects page)
   alongside characters: checkbox list → accepted entries become `ProductionLocation`
   records (`createdByAI: true`, permitStatus `"scouting"`). Skip (pre-uncheck) any
   proposal whose name/alias already matches an existing location record.
5. Add a "Rebuild from script (AI)" button on the Locations page that reruns just this
   pass for the active project's script and proposes only *new* locations.

**Acceptance:** upload a script with a key set → accept proposals → Locations page shows
consolidated locations, each knowing its scenes; total added cost is one request.

---

### WO-3 · Stop throwing away the character bible → auto-build the Cast list

**Problem.** `runBreakdown` produces a rich `ScriptCharacter[]` (aliases, speaking,
importance) but [Projects.tsx](../src/pages/Projects.tsx) only flashes it in the results
modal (`setFoundCharacters`) and discards it. The Cast page then requires manual re-entry
of the very people the AI already identified. Also, the single-scene re-run in
[Breakdown.tsx:193](../src/pages/Breakdown.tsx) still uses the weak regex
`extractCharacters` because the bible isn't persisted.

**Build:**

1. Persist the bible: add `characterBible: ScriptCharacter[]` to `ProductionData` +
   `blankData()`; store it when a breakdown run finishes.
2. In the breakdown results modal, add a "Create cast list" step: checkbox list of
   speaking characters (non-speaking collapsed under a toggle) → accepted entries become
   `CastMember` records via the existing `addCastMember`, with mapping
   `lead → "lead"`, `supporting → "supporting"`, `minor/background → "day_player"`,
   `role` = character name, `scenes` = scene ids whose elements or script text match the
   name/aliases, `ratePerDay: 0`. Skip characters that already exist (match by
   name/alias, case-insensitive).
3. Single-scene re-run (`Breakdown.tsx`): pass the stored `characterBible` (via the
   `characterBible` context field of `aiBreakdownBatch`/`aiBreakdownScene`) instead of
   calling `extractCharacters(scenes)`.
4. DOOD synergy: once cast members carry `scenes`, add a "Seed from schedule" button on
   the DOOD tab that fills the matrix deterministically (W on days containing their
   scenes, H between first and last day, OFF outside) — no AI call needed. Existing cell
   values are never overwritten; log activity.

**Acceptance:** after one breakdown run the Cast page is populated, DOOD can be seeded in
one click, and re-running one scene uses the good character names.

---

## Phase 2 — Finish the three declared-but-dead AI features

These already exist as `AIFeature` ids and AISettings cost rows, but have **zero call
sites**: `task_proposals`, `report_narration`, `nl_query`.

### WO-4 · Task Proposals (free-tier: 1 request per run)

On the Tasks page, add "Propose tasks (AI)" (visible when scenes have breakdown
elements). One request: send a compact digest — per department, the breakdown elements
(name, category, subCategory, description) grouped by scene, plus the shoot-day list
(dayNumber, date, scene numbers) and existing task titles (so it doesn't duplicate).
System prompt: a line producer generating department prep tasks; each task must
reference a real deadline anchor. JSON schema:
`{ tasks: [{ title, department, priority, linkedScene?, deadlineRule, notes? }] }` where
`deadlineRule` uses the existing grammar (`shoot_day(N) - 3d`, `location_lock(NAME) - 7d`,
`manual(YYYY-MM-DD)`) — validate each with `evaluateDeadline` and drop invalid ones.
Review modal (grouped by department, checkboxes) → accepted tasks created via
`createTask` with `createdByAI: true` and owner defaulting to the current user. Cap the
proposal list at ~40. Demo fallback: rule-based tasks (permit task per EXT location,
fitting per wardrobe element, wrangler per animal, etc.).

### WO-5 · Report Narration (free-tier: 1 request, tiny)

In the Reports preview panel (`src/pages/Reports.tsx`), add a "Narrate (AI)" button.
Send report title + columns + up to ~80 rows as CSV; ask for a 3–5 sentence executive
summary calling out totals, outliers, and risks — numbers must come from the table.
Render above the preview table with the token count, and include the narration in the
`printReport` output when present. Demo fallback: "X rows across Y …" template. This is
the cheapest feature in the app — a natural default for Flash Lite (see WO-9).

### WO-6 · "Ask the production" NL query (free-tier: 1 request per question)

Add an ask box on the Dashboard (or a TopBar popover): the user types "which days is
BEA on set?" / "what's unspent in art?". Build a compact JSON snapshot — production
meta, scenes (number, location, D/N, pages, cast element names), shoot days, cast,
task titles+status+deadline, budget lines (code, description, budgeted, spent),
location records — **strip script text**; cap the serialized snapshot at ~30k chars,
dropping the largest sections first with a note to the model about what was omitted.
System prompt: answer only from the data, cite scene/day numbers, say "not tracked"
when the data can't answer. Plain text out (no schema). Show answer + a small history
of the session's Q&A. Demo fallback: keyword lookup over scene locations/cast names
with an honest "demo mode" note.

---

## Phase 3 — Higher-leverage AI features

### WO-7 · AI Schedule Draft — populate the strip board (free-tier: 1 request)

The Schedule strip board starts empty and every shoot day is manual. Add "Draft
schedule (AI)" (visible when scenes exist and shoot days are empty or user confirms
overwrite of *unpublished* days). One request: send scene digests (number, INT/EXT,
location — canonical via the locations collection, D/N, pages, cast names, vfx/sfx
flags) + constraints (target pages/day from `production.plannedPagesPerDay`, start
date, 5-day weeks). System prompt: a 1st AD building a strip board — group by location
to minimize company moves, batch night scenes into contiguous nights, respect page
counts, keep heavy-cast scenes early. Schema:
`{ days: [{ dayNumber, date, location, sceneNumbers, estimatedHours, rationale }] }`.
Review modal shows the proposed board (days with strips + rationale) → accept creates
`ShootDay` records and logs activity; scenes it couldn't place stay in the unassigned
pool. Validate: every sceneNumber exists, no scene twice, dates sequential. Demo
fallback: deterministic grouping by location then D/N, packing to `plannedPagesPerDay`.
This is the single biggest "wow" for the AD persona.

### WO-8 · Real scene synopses — zero extra requests

`parseScreenplay` sets `synopsis` to the first 140 chars of the body — on most scripts
that's a fragment of an action line. Add an optional `synopsis` string to the per-scene
schema in `BATCH_SCHEMA` (`src/lib/claude.ts`) and one line to `BREAKDOWN_SYSTEM`
("also return a one-sentence production synopsis of the scene"). In `runBreakdown`, use
the returned synopsis when present. Free: it rides the existing breakdown batches.
Everything downstream (strip board strips, reports, DOOD tooltips) instantly reads
better.

### WO-9 · Per-feature model routing — light features ride the free tier

Add `lightModel?: string` to `AIConfig` (default `"gemini-2.5-flash-lite"` when a Google
key exists, otherwise unset) and a `weight: "heavy" | "light"` option on
`ClaudeCallOptions`. `callLive` resolves: light + `lightModel` set + key for its provider
present → use it; otherwise the main model. Mark `daily_digest`, `report_narration`,
`nl_query` as light; breakdown/bibles/tasks/schedule stay heavy. AISettings gets a
second model picker ("Light tasks model") with the existing free-tier badge and the
Google-trains-on-free-tier warning. Result: an admin can run Opus for breakdowns while
digests/narrations/queries cost nothing.

### WO-10 · Daily digest worth reading (and honest)

`runDigest` ([Dashboard.tsx:261](../src/pages/Dashboard.tsx)) currently sends
**hardcoded "Schedule adherence 91%"** and only four numbers. Rebuild the prompt input
from real state: days shot vs planned, pages shot vs planned (from shoot days + scene
pages), overdue tasks (top 5 titles + owners + days overdue), pending POs with amounts,
budget lines over 90% spent, location lock dates within 7 days, DOOD conflicts (cast
working two locations same day), unassigned scenes count. Ask for 4–6 bullets ranked by
urgency, each citing its number. Cache the result + input-hash in the store
(`aiDigest: { at, text, hash }`): auto-run at most once per day when a key exists and
the hash changed; manual button always available. Feature stays `daily_digest`, weight
light (WO-9).

---

## Phase 4 — Credibility fixes (no AI, just stop faking numbers)

### WO-11 · Kill every hardcoded metric

A "billion-dollar SaaS" can't show invented KPIs:

- [Dashboard.tsx:246-253](../src/pages/Dashboard.tsx) radar: `86, 88, 93, 74, 95` are
  literals. Compute: Pages/Day = actual pages shot ÷ (plannedPagesPerDay × days shot);
  Scene Completion = scenes on completed days ÷ total; Budget Adherence = 1 − overrun
  ratio; VFX Delivery = delivered/final shots ÷ total; Equipment Readiness = checked-out
  items returned ratio (or drop the axis if untracked). Hide the radar (EmptyState)
  until there's data.
- StatCard sparkline `[72, 75, 74, 78, 76, 79, health]` and the hardcoded trend labels
  ("~0.2 pages/day behind", "Steady vs last week") — derive or remove. A daily snapshot
  array in the store (`healthHistory`, appended once per day on load) makes the
  sparkline real.
- The demo-y `onTimePercent` default of 100 on vendors is fine, but any other literal
  presented as live production data should be traced and computed. Grep the Dashboard
  for numeric literals feeding charts.

### WO-12 · Free-tier rate-limit guard

`mapWithConcurrency(…, 3)` can exceed Gemini free-tier RPM on big scripts when combined
with retries. Add a module-level token-bucket limiter in `claude.ts` keyed by provider
(default ~8 requests/min for google-with-free-tier-model, generous for anthropic),
awaited inside `callLive` before each attempt. Keep honoring `retry-after` (already
done). Surface "waiting for rate limit…" through the existing progress callback so long
runs explain themselves instead of looking hung.

---

## Quick reference — current AI surface (as of this audit)

| Feature (`AIFeature`) | Status | Call site |
|---|---|---|
| `script_breakdown` | ✅ live, batched 10/request ×3 concurrent | `runBreakdown` → `aiBreakdownBatch`; single-scene re-run in Breakdown page |
| `character_bible` | ✅ live, 1 request/script — **result discarded after display (WO-3)** | `runBreakdown` → `aiCharacterBible` |
| `daily_digest` | ⚠️ live but sends hardcoded numbers (WO-10) | Dashboard `runDigest` |
| `task_proposals` | ❌ declared only (WO-4) | — |
| `report_narration` | ❌ declared only (WO-5) | — |
| `nl_query` | ❌ declared only (WO-6) | — |
| `location_bible` | 🆕 proposed (WO-2) | — |
