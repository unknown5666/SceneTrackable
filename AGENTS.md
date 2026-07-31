# SceneTrackable — Agent Logic Map

> **What this file is.** A complete map of *every* feature's logic, plus the
> wiring between them, so an agent can fix something without re-reading the
> tree. For each area: what it does, the files that own it, the key functions
> (with `file:line`), and the gotchas that bite.
>
> Companion docs: [`AGENT-BRIEF.md`](AGENT-BRIEF.md) = fast-start orientation
> (stack, design tokens, UI primitives, conventions). [`POLISH-CHECKLIST.md`](POLISH-CHECKLIST.md)
> = live task status. This file is the "how every feature works" reference.

---

## 0. The whole system in one picture

```
                     ┌─────────────────── AI enrich path ───────────────────┐
screenplay (pdf/txt) ─▶ extractPdfText ─▶ parseScreenplay ─▶ runBreakdown ─▶ store
                        pdf.ts+pdf-lines   script.ts          script.ts       (scenes+elements+
                                                              (+claude.ts)     characterBible+locations)

budget file (pdf/csv) ─▶ extractPdfText ─▶ parseBudgetText ─▶ review modal ─▶ importBudgetLines ─▶ store
                                            budgetImport.ts    BudgetImportModal                    (budgetLines)

store (state/store.ts, ONE Zustand store) ─▶ every page reads from it
   │
   ├─ persists to localStorage  "scenetrackable-v1" (version 6)
   └─ optionally syncs to Supabase (cloud.ts, env-gated)

store ─▶ reports.ts / scheduleExports.ts ─▶ CSV (download) · print window (Arabic-safe PDF) · jsPDF (Latin)

Derived, never authored:  metrics.ts (dashboard KPIs) · reports.ts (tables) · snapshot.ts (ask-AI context)
AI pattern everywhere:    model returns a PROPOSAL → user reviews → accept writes a record (proposals.ts et al.)
```

**Two mental anchors:**
1. **The store is the single source of truth.** Pages hold almost no logic —
   they read state and call store actions. Domain logic lives in `src/lib/*`
   and the store's action implementations.
2. **AI never writes silently.** Every AI feature produces a *proposal* the user
   reviews and accepts. Live calls never silently fall back to demo — failures
   surface. (`claude.ts` header.)

---

## 1. State — the hub (`src/state/store.ts`)

One Zustand store, persisted to `localStorage["scenetrackable-v1"]`, version 6,
shape `{ state, version }`. `partialize` strips only `aiJobs` (transient).

- **Active project lives at the top level of state**; inactive projects are
  snapshots in `projectData` (shape = `ProductionData`, `types/index.ts:781`).
  `blankData()` / `DATA_KEYS` define the collection set. `switchProject`
  (`store.ts:820`) swaps the top-level spread.
- **All mutations are store actions.** Full list at `store.ts:328–528` (the
  interface) with implementations from `store.ts:566` onward. If you're putting
  domain logic in a `.tsx`, it probably belongs here.
- **Deletes `pushToast` with an Undo action** (`deleteRecord`, `deleteTask`,
  `removeCastMember`, `importBudgetLines`). Follow that pattern.
- **Derived fields are recomputed, never authored** — e.g. `production.budget`
  in `importBudgetLines` (`store.ts:1231`).
- **Persisted additive fields are safe** (zustand merges initial over missing
  keys) — no version bump for adds; bump only for shape changes.
- Toasts (`lib/toast.ts`) live **outside** the store so they never cloud-sync.
- Non-React code reaches the router via `lib/nav.ts` (`navigateTo`), registered
  by MainLayout.

---

## 2. Auth, users, roles (`store.ts` auth section, `types/index.ts:10–80`)

- **Login** (`store.ts:566`): password is `sha256$…` hashed (`lib/utils.sha256Hex`).
  Seeded master **Admin / 1234**. `login` is async because it also bootstraps
  the cloud workspace.
- **Invites**: an admin `inviteUser` issues a one-time `inviteCode`; the user
  `redeemInvite`s it to set a password (`store.ts:600,650`). Empty `password` =
  invite pending (`isInvitePending`).
- **Roles are data-driven** (`data/roles.ts`). Each role has per-page
  `permissions: none|read|write`. **`access` is DERIVED** from permissions
  (`accessFromPermissions`, `types/index.ts:76`) — never author it. Admin role =
  `access: ["all"]`.
- **Permission checks**: `permissionFor(role, pageKey)` (`types/index.ts:66`) →
  admins are `write` everywhere; pre-levels roles treat listed pages as `write`.
  Store helpers `canWrite(s, page)` / `canRead` gate the UI.
- **Routing guards** (`App.tsx`): `AccessGuard page="…"` bounces `none` to a
  fallback; `AdminGuard` wraps `/admin`, `/activity`. `/ai` and `/cloud` are
  redirects to `/admin?tab=…`.

---

## 3. Projects (`store.ts` projects section)

- `createProject` / `switchProject` / `renameProject` / `deleteProject`
  (`store.ts:793–867`). Active project data at top level; others snapshotted.
- `setProjectScript` stores the uploaded screenplay (`ProjectScript`:
  raw text + fileName + source). `replaceScenes` swaps the scene list after a
  parse (`store.ts:876`).
- The **projects list** (`Project[]`) is a lightweight summary (scene/element
  counts) kept alongside the heavy `projectData` snapshots.

---

## 4. Screenplay ingest (`src/lib/script.ts` + `pdf.ts` + `pdf-lines.ts`)

### 4.1 PDF text extraction (`pdf.ts` + `pdf-lines.ts`)

A PDF has no words/lines, only glyph runs at coordinates, and Arabic PDFs emit
runs in **visual** order — so *position*, never stream order, drives everything.

- `pdf.ts` — pdf.js worker glue. **Vite-only** (`?url` import); never re-export
  it from a module that must run in Node.
- `pdf-lines.ts` — pure geometry, Node-testable:
  - `reconstructLines` (`:264`) groups runs by baseline (`Y_TOLERANCE`), orders
    top-to-bottom.
  - `renderLine` (`:237`) sorts runs by left edge (descending for RTL), **never
    reverses a string**, then re-flips embedded LTR groups.
  - `ltrGroups` (`:196`) — the rule an x-sort can't express: a number laid out
    L-to-R *inside* an RTL line arrives one digit per run. Without it, scene 10
    imports as "01" and 20,000 as "000,20". A visible gap ends a group (count
    column vs amount column).
  - `clean` (`:97`) — NFKC, drops control chars + harakat + tatweel; repairs the
    reversed Allah ligature (هللا → الله) by name.

### 4.2 Screenplay → scenes (`script.ts:269 parseScreenplay`)

- **Heading matching** (`matchHeading`, `:225`): English `HEADING_RE`, plus four
  Arabic slugline forms — labelled («مشهد ١ - داخلي - مقهى - ليل»), bare
  («داخلي - مقهى - ليل»), and **slash** house-style («م 10 / الطريق . خارجي – نهار»,
  location-first). داخلي/خارجي are ordinary words, so a bare form **requires a
  separator** or the parse eats action lines as scenes.
- **Location/time split** (`splitHeading` `:164`, `splitSlashHeading` `:198`):
  time is *the field that names a time*, wherever it sits — not the last field.
- **Episode handling** (`:284`+): index rows («جدول المشاهد») have no body and are
  dropped; a repeat of an already-used scene number marks a new episode, and
  numbers get qualified `2-5` so `runBreakdown` keys don't collide.
- Scenes carry `pages` (eighths, `estimatePages`) and `estimatedShootMinutes`.

### 4.3 Character extraction fallback (`extractCharacters`, `:352`)

Regex cue detection (ALL-CAPS English; Arabic `arabicCue` shape heuristic,
`:341`), frequency floor ≥2. This is the **fallback** when the AI character pass
is unavailable.

---

## 5. AI breakdown run (`script.ts:477 runBreakdown` + `claude.ts`)

The core enrichment. Two passes:

1. **Pass 1 — character bible + location bible** (`aiCharacterBible`,
   `aiLocationBible`). The character pass runs first and threads through the
   scene passes so batches don't re-guess who "the doctor" is. Location pass
   rides alongside (`runLocationPass`, `:427`) and **never throws** — falls back
   to `fallbackLocations` deterministic grouping.
2. **Pass 2 — batched scene breakdown** (`aiBreakdownBatch`). Batches of
   `BREAKDOWN_BATCH_SIZE`, `BREAKDOWN_CONCURRENCY=3` in flight via
   `mapWithConcurrency`. Each scene that fails/skips falls back to
   `demoBreakdown` and is recorded in `failedScenes`.

- **Progress** streams via `onProgress` (`BreakdownProgress`) and per-scene
  `onSceneDone` (feeds the live Breakdown Theater). Never blocks the run.
- **Retry** (`retryBreakdownScenes`, `:666`) re-runs Pass 2 only for a subset,
  reusing the cached character bible — the "retry the missing scenes" path.
- **Failure classification** (`classifyAIError`, `:786`): distinguishes a rate
  limit (`kind:"rate"`, ~60s, free tier 15 RPM) from an exhausted allowance
  (`kind:"allowance"`, error 1113, effectively permanent). Drives the cooldown
  UI (`ui/CooldownRetry.tsx`).
- **Background job tracking**: `startBreakdownRun` (`store.ts:500`) runs it as a
  tracked `aiJob` (see §17) so navigating away never cancels it and the TopBar
  pill shows it. Results save incrementally → an interrupted run reloads as
  *resumable*, never *running* (`aiJobs` is not persisted).

### 5.1 The AI provider (`claude.ts`) — ⚠️ off-limits for UI work

- **One provider, one model**: Z.ai GLM, `glm-4.7-flash` (the only free id; all
  billed ids 1113 immediately). Key hardcoded (public free tier). Header
  explains why. **Do not touch** `claude.ts`, `cloud.ts`, `supabase/` unless the
  task is explicitly AI/cloud.
- Every feature has a demo fallback (`demoBreakdown`, `demoDigest`,
  `demoNarration`, `demoScheduleDraft`, `demoTaskProposals`) so the app works
  with no key.
- **Arabic directive** (`lang.ts:156 languageDirective`): tells the model to
  keep human-readable values in Arabic but keep enums/keys/scene-numbers ASCII,
  because the app matches on those.
- Full AI feature list = `AIFeature` union (`types/index.ts:627`):
  `script_breakdown, character_bible, daily_digest, report_narration, nl_query,
  task_proposals, location_bible, schedule_draft, call_sheet, dood_draft,
  art_suggestions, location_scout, invoice_parse, continuity_optimize`. The last
  two are documented in §25.2 (invoice parsing) and §7.1 (continuity optimizer).

---

## 6. Scenes & elements (`store.ts` scenes section, `pages/Breakdown.tsx`)

- `updateScene`, `addScene`, `removeScene`, `addElementToScene`,
  `removeElementFromScene`, `updateElement` (`store.ts:897–939`).
- `mergeAIProposalIntoScene` (`:939`) folds accepted AI proposals in.
- `Scene.elements` are `BreakdownElement`s categorized by `ElementCategory`
  (`types:97`: cast, extras, props, wardrobe, sfx, vfx, vehicles, animals,
  locations, makeup, stunts, production). `vfxFlags`/`sfxFlags` are derived from
  element categories.
- Element category → colour/label lives in `lib/breakdownVisuals.ts`
  (`CATEGORY_META`); reuse it everywhere categories render.
- Breakdown page deep-links: `?scene=<id>` + `?action=rerun` handled in
  `Breakdown.tsx`.

---

## 7. Schedule / strip board (`pages/Schedule.tsx`, `store.ts` schedule section)

- **Strip board**: dnd-kit. Each `DayColumn` is a `useDroppable` (`id="day_N"`)
  so scenes drop onto empty days, not just onto strips. `moveSceneToDay`
  (`store.ts:957`) moves a scene id between days at an index.
- **Location matching** (`lib/locations.ts`): `dayLocations(day)` is the
  resolver everything uses (a day can span multiple locations — a company move).
  `sceneMatchesDay` — a day with no location holds any scene; a scene at a
  location not in the day's list is *off-location* (shown + draggable, never
  hidden).
- **Over-target warning**: days over `production.plannedPagesPerDay` show a
  badge.
- **Publishing** (`publishSchedule`, `store.ts:999`): bumps
  `publishedSchedule.version`, records `lastChanges`, and notifies. Drives
  schedule-change notifications.
- **AI schedule draft** (`lib/scheduleDraft.ts` + `aiScheduleDraft`):
  `buildScheduleDigest` → model → `validateSchedule` (drops invalid days) →
  `shootDayFromProposal`. `demoScheduleDraft` groups by location, skips weekends
  (`shootingDates`). Proposal → user accepts → real `ShootDay`s.

### 7.1 Shot/Not-Shot, timeline boundaries, AI continuity optimizer

- **Shot/Not-Shot**: `Scene.shotStatus?: "shot"|"not_shot"` (`types/index.ts`,
  absent = not_shot). Toggled per-strip in `SceneStrip` (a small button with
  `onPointerDown` `stopPropagation` so it doesn't get eaten by the dnd-kit drag
  listeners on the strip). Store action `setSceneShotStatus` (`store.ts`).
  **`ShootDay.scenes` still only encodes assignment, never completion** — a
  scene being on a day's list means it's scheduled there, not that it's shot.
- **Migrate unshot scenes**: `DayColumn` shows a day-picker + arrow button when
  a day holds any `shotStatus !== "shot"` scene and another day exists. Calls
  `migrateUnshotScenes(fromDay, toDay)` (`store.ts`) — one batched write, one
  summary notification, moves only the unshot subset, leaves shot scenes where
  they are.
- **Timeline boundaries**: `ProductionMeta` carries five optional ISO-date
  fields — `preProductionStart`, `principalPhotographyStart`,
  `principalPhotographyEnd`, `postProductionStart`, `postProductionEnd`.
  Edited via the `TimelineCard` at the top of `pages/Schedule.tsx`, written with
  `updateProductionMeta(patch)`. **This is the only page that edits
  `ProductionMeta` today** — a pre-existing gap this closes for just these five
  fields (nothing else on the meta object has a form anywhere).
  - **`postProductionStart` is deliberately independent of
    `principalPhotographyEnd`.** Post routinely starts *before* wrap — an editor
    cuts dailies while the unit is still shooting — so it is never derived from
    the photography end date. The bundled production is exactly this shape
    (shoot Sep 20 → Oct 19, post opens Sep 21), and the real production's own
    calendar sheet writes those overlapping days «تصوير + مونتاج». Anything
    reading the timeline must treat shoot and post as **overlapping windows,
    not a sequence** (see `buildGeneralCalendarTable`, §26).
- **Dating the board**: `alignShootDayDates(startDate, count?)` (`store.ts`)
  re-dates every shoot day to consecutive calendar days from `startDate` in
  `dayNumber` order, and recomputes `production.totalShootDays`. With no shoot
  days yet it *creates* `count` blank ones instead — so a brand-new project can
  go from "principal photography starts here, 30 days" to a dated board in one
  click. Exposed as the "Align Shoot Day Dates" / "Generate Shoot Days" control
  in `TimelineCard`. Date arithmetic goes through `addDaysIso` (`lib/utils.ts`),
  which is UTC-based so a board never shifts a day on a timezone boundary.
- **AI continuity optimizer** (`lib/continuity.ts` + `aiContinuityOptimize` in
  `claude.ts`, feature id `continuity_optimize`): mirrors the
  `taskProposals.ts` shape (digest builder → model → validator → review UI).
  - `buildContinuityDigest(d)` — the heuristic pre-analysis the model reasons
    over: which locations (`scenesAtLocation`) and which tracked wardrobe
    `ArtElement`s (`category==="wardrobe"`, by `sceneIds`) currently have their
    scenes spread across non-adjacent shoot days. The model only has to
    propose fixes to a spread already computed in code — it's not asked to
    re-derive the schedule.
  - `validateContinuityMoves(moves, d)` re-checks every proposed
    `{sceneNumber, toDay, reason}` against real records: rejects a move that
    names a scene/day that doesn't exist, falls outside
    `principalPhotographyStart/End`, or lands on/after a location's `lockDate`
    (documented assumption: a location's lock date is read as "must shoot
    there by this date"). **The model's stated reason is never trusted as
    proof a move is legal** — only the validator's checks are.
  - Accepted moves apply via `applyContinuityMoves` (`store.ts`) — a single
    batched write + one summary notification, not one per move.
  - Review UI: `ContinuityModal` in `pages/Schedule.tsx`, triggered by the
    "Optimize with AI" button. Rejected moves are shown to the user with their
    reason, not silently dropped.

---

## 8. DOOD — Day-Out-Of-Days (`store.ts` DOOD section, `pages/CastPortal.tsx`)

- `DoodMatrix` = `castId -> shootDay -> DoodStatus` (`types:245`). Statuses:
  W/H/SW/WF/SWF/T/OFF (`types:227`).
- `cycleDoodCell` (`store.ts:1071`) rotates a cell; `setDoodStatus` sets it.
- `seedDoodFromSchedule` (`store.ts:435`) derives an initial matrix from which
  scenes each cast member is in vs which day those scenes are scheduled.
- **AI DOOD draft**: `aiDoodDraft` feature.

---

## 9. Cast & crew (`store.ts` cast/crew sections)

- `CastMember` (`types:230`): character role, category (lead/supporting/
  day_player), scene ids, `ratePerDay`. `CrewMember` (`types:82`): department,
  optional `roleId`, `ratePerHour`, `otRateMultiplier`.
- Cast CRUD `addCastMember`/`updateCastMember`/`removeCastMember`
  (`store.ts:467`); crew equivalents (`:473`).
- **From AI**: `proposals.ts` — `castFromCharacter` turns an accepted
  `ScriptCharacter` (from the character bible) into a `CastMember`;
  `characterExists`/`castCategoryFor`/`scenesForCharacter` support the review
  surface.

---

## 10. Locations (`pages/Locations.tsx`, `lib/locations.ts`, `proposals.ts`)

- `ProductionLocation` (`types:160`): canonical `name` + `aliases`, `permitStatus`
  (scouting→optioned→permit_pending→locked→wrapped), `lockDate`, contacts, cost,
  photo, map.
- **Name resolution** is the crux — a script spells one place many ways:
  - `useLocationNames()` (`locations.ts:41`) unions canonical names + names
    derived from scene headings, shoot days, `locations` elements, and legacy
    lock-date keys.
  - `sceneMatchesLocation` / `scenesAtLocation` match by canonical name **or
    alias**.
  - `resolveLockDates` (`locations.ts:89`) — location records win over the legacy
    `locationLockDates` map; aliases resolve to their location's date so a
    deadline rule survives a rename.
- `setLocationLock` (`store.ts:1032`). **AI**: `aiLocationScout` (`location_scout`
  feature) + `locationFromProposal`.

---

## 11. Tasks & deadlines (`store.ts` tasks, `lib/deadlines.ts`, `lib/taskProposals.ts`)

- `Task` (`types:268`): owner (crew id), department, `deadlineRule` (a string
  expression) + `computedDeadline` (resolved ISO), status, priority, `blockedBy`.
- **Deadline expressions** (`lib/deadlines.ts`) — the mini-language:
  - `manual(YYYY-MM-DD)`, `shoot_day(N) [±Nd]`, `location_lock(LOC) [±Nd]`.
  - `evaluateDeadline(rule, ctx)` (`:64`) resolves against `shootDays` +
    `resolveLockDates`. `humanizeRule` renders "3d before Day 15".
  - `recomputeAllDeadlines` (`store.ts:1016`) re-resolves every task's rule after
    the schedule or a lock date moves. **Call it whenever those change** or
    deadlines go stale.
- **Kanban** (`pages/Tasks.tsx`): status columns, dnd. `updateTaskStatus`.
- **AI task proposals** (`taskProposals.ts`): `buildTaskDigest` →
  `aiTaskProposals` → `validateProposals` → `taskFromProposal`.
  `CATEGORY_DEPARTMENT` maps element categories to the prepping department.
  `demoTaskProposals` generates them offline.

---

## 12. Budget import (`lib/budgetImport.ts`, `components/budget/BudgetImportModal.tsx`)

The one import where a confident guess is worse than a question — it **never
invents a figure or a section**, it asks.

### 12.1 Pipeline
```
file ─▶ ingest()               BudgetImportModal.tsx:72
     ─▶ extractPdfText / text   (PDF via pdf-lines, CSV/TXT raw)
     ─▶ parseBudgetText         budgetImport.ts:493   → ParsedBudget
     ─▶ ReviewStep (resolve)    BudgetImportModal.tsx:297
     ─▶ toBudgetLines           budgetImport.ts:585   → BudgetLine[]
     ─▶ importBudgetLines       store.ts:1220
```

### 12.2 Parsing (`budgetImport.ts`)
- `BUDGET_SECTIONS` (`:40`) — 13 bilingual top-sheet sections → `DepartmentId`.
  Coarse on purpose; the user's own **account code is preserved per line**.
- `SECTION_RULES` (`:118`) — ordered keyword rules, **most specific first**. Order
  IS the design: crew roles before bare «مخرج» (director, above-the-line); **post
  before sound/camera**; **cast last** (أجور appears on crew rows too).
- `foldArabic` (`:88`) — folds hamza, final ya/ta, and **lam-alef order** (the PDF
  stores that ligature reversed, الإنتاج→اإلنتاج, and no safe substitution undoes
  it, so matching is made blind to it). Fold both sides before comparing.
- `parseAmount` (`:187`) — repairs backwards number runs ("000,02"→20,000 by
  grouping shape); **returns null** when neither reading is valid → row asks.
- `parseFreeLine` (`:363`) — identifies each field by *what it is*, not position
  (RTL reverses Latin rows): code = small int at an edge next to text; amount =
  largest remaining number; qty = a small int that isn't the code.
- `parseDelimitedLine` (`:438`) — CSV/TSV; column **names** beat position; a named
  section beats a guess.
- `parseBudgetText` (`:493`) — stateful pass; folds wrapped continuation lines
  into the row above; extracts declared total, title, currency, `skipped[]`.
- Unresolved rows carry `issues: "no_section" | "no_amount"`.

### 12.3 Review + landing
- Modal **blocks import while any row is unresolved** (`:113`). Declared-total
  **drift is a warning, not a blocker** (`:345`).
- `toBudgetLines` (`:585`) filters to `section && amount!==null`; **missing codes
  get a synthetic `(i+1)*10`**.
- `importBudgetLines` (`store.ts:1220`) replaces/appends, **recomputes
  `production.budget`**, adopts file currency, Undo toast.

### 12.4 Why the imported total can differ from the file (reference)
Traced on `scripts/data/mazraat-yadoo-3-budget.txt`
(`npx tsx scripts/budget-test.ts <that file>`): parsed **772,000** vs file's
stated **757,000**.

| Cause | What happens |
|---|---|
| **File's own total is wrong** | Rows genuinely sum to 772,000; the «المجموع» line says 757,000 (omits the 15,000 DIT row). App sums rows itself and warns. |
| **Rows with no amount** | Blank source rows (camera rental, lighting, crane) carry `no_amount` and must be answered — final total depends on the answers. |
| **Orphaned code** | Code `28` alone on its own line can't attach to its row → synthetic code. |
| **Qty pulled from description** | «فني إضاءة عدد (4)» → «… ( )» + `×4`. |
| **Coarse categories** | 13 sections, not the file's numbering (codes kept). |

**The app never invents a missing figure** (commit `1d9b793`).

---

## 13. Purchase orders & petty cash (`store.ts` PO section, `pages/Budget.tsx`)

- `PurchaseOrder` (`types:315`): a **multi-step approval chain**
  `draft→submitted→accountant_review→admin_approval→approved|rejected`, with an
  `approvals[]` trail and `auditLog[]`.
- `submitPO` (`store.ts:1166`) creates it (auto `number`); `advancePO`
  (`store.ts:1181`) records an accountant/admin decision, appends to the audit
  log, notifies, and moves status.
- `PettyCashEntry` (`types:339`) + `addPettyCash`.
- POs and petty cash are the **only dated money records**, so they drive the
  weekly-spend chart (`metrics.buildSpendChart`).
- **Installments** (`PurchaseOrder.installments?: Installment[]`, `types:295`):
  a PO's milestone/part-payment schedule. `addInstallment`/`updateInstallment`
  (`store.ts`). UI: an expandable row per PO in `pages/Budget.tsx`'s
  "Purchase Orders" tab (`InstallmentPanel`). An installment's `status` the
  app writes is only ever `"pending"`/`"paid"` — `"overdue"` is a **display-only**
  derivation (`dueDate < today && status==="pending"`), never persisted, so
  nothing has to keep it in sync. See §25.4 for how installment totals feed the
  finance dashboard separately from the top sheet's budgeted/spent.

---

## 14. Dashboard metrics (`src/lib/metrics.ts`) — everything is measured

The rule (`metrics.ts` header): **a metric is computed from the store, or it is
`undefined` and the UI says so.** Never a plausible constant. This file exists
because the dashboard used to invent KPIs.

- `computeMetrics(d)` (`:92`) → `ProductionMetrics`. `Maybe = number | undefined`.
  Ratios return `undefined` when the denominator is 0 (`ratio`, `:18`).
- **Only counts scene ids that resolve to a real scene** (`shotSceneIds`,
  `scheduledSceneIds`) — a board can reference deleted scenes.
- Pace is `undefined` until a shot day actually holds a scene (else 0% reads as
  "badly behind" from missing data). Scene completion measured against the board.
- `health` (`:157`) averages only the axes that exist (weighted pace/budget/
  tasks); `undefined` when nothing is measurable.
- `radarAxes` (`:201`) omits missing axes and hides below 3. `buildPaceChart`
  (`:238`) = scheduled pages/day from the board. `buildSpendChart` (`:287`) = real
  weekly burn from petty cash + POs (budget lines have no dates).
- `buildDigestInput` (`:342`) assembles the **daily-digest** facts (all measured;
  separates facts shown to the user from guidance addressed to the model) +
  derives real problems: cast double-booked across locations, overdue tasks,
  pending POs, locations locking within 7 days. Hash → digest cache key.

---

## 15. Reports (`src/lib/reports.ts`, `pages/Reports.tsx`)

- `REPORTS` (`:52`) — declarative `ReportDef`s: scenes, elements, cast, dood,
  schedule, locations, budget, tasks, drones. Each has `isEmpty`, columns, and a
  row builder over `ProductionData`.
- `exportReportCSV` (`:400`) / `printReport` (`:419`) / `tableToCSV` /
  `triggerDownload`.
- **Location Report** carries a `"Scene Count"` column (`at.length`, right after
  `"Location"`) alongside the existing scene-number list column — the count was
  previously only derivable by reading the list.
- **AI narration**: `aiNarrateReport` writes an executive summary over a table;
  `demoNarration` offline.
- **Real PDF export + WhatsApp share**: see §24 — every report card also has a
  `ShareMenu` that builds an actual `.pdf` (via `buildTablePdf`), not just the
  print-window path.

---

## 16. Department portals: VFX, RF, Camera, Drones, Art, Timesheet

All follow the same store-collection + page pattern. Types in `types/index.ts`.

- **VFX** (`pages/VFXPipeline.tsx`): `VFXShot` status pipeline
  (bid→…→delivered), `VFXVendor`. `updateShotStatus`, `assignShotVendor`
  (`store.ts:1258`+). `vfxDelivery` metric = final+delivered ÷ all.
- **RF/Comms** (`pages/RFComms.tsx`): `FrequencyPlanEntry`, `RFEquipment`.
  `assignRFEquipmentToDay`.
- **Camera** (`pages/CameraPortal.tsx`): `CameraKit`, catalog presets
  (`data/equipment-presets.ts`). `assignKitToDay`.
- **Drones** (`pages/Drones.tsx`): `Drone` (reg status, operator, rates),
  DJI/aerial catalog presets.
- **Art/Wardrobe/Props** (`pages/ArtPortal.tsx`): `ArtElement` status
  (needed→…→ready), continuity photos. `updateArtElementStatus`. **AI**:
  `aiArtSuggestions` (`art_suggestions`).
- **Timesheet** (`pages/Timesheet.tsx`): `TimesheetEntry` + `OTRules`.
  `addTimesheetEntry`, `editTimesheetHours` (records an edit trail with
  `isAdminOverride`), `submitTimesheetForCrew`.
- **Checkouts/checklists**: `EquipmentCheckoutEntry`, `Checklist`.
  `toggleChecklistItem`. `equipmentReadiness` metric = returned ÷ all.

---

## 17. AI background jobs (`AIJobState`, `store.ts` aiJobs section)

Long AI runs are tracked in the store, not a component, so navigating away never
cancels them and the TopBar `AIStatusPill` shows them from anywhere.

- Lifecycle actions: `aiJobBegin/Progress/PauseLimit/Done/Fail/Reset`
  (`store.ts:491`). Selector `activeAIJob`. `job.progress = {done,total}`.
- `AIJobStatus` (`types:673`): idle/running/**paused_limit**(1113)/done/error.
- **Transient** — `aiJobs` is stripped by `partialize`, so an interrupted run
  reloads *resumable* (results were saved incrementally), never *running*.

---

## 18. Generic record CRUD (`src/data/schemas.ts`, `ui/RecordEditor.tsx`)

Schema-driven CRUD for the simpler collections, so a new record type needs a
schema, not a bespoke form.

- `RecordCollection` (`:12`) — the array keys this covers. `SCHEMAS` (`:115`) maps
  each to a `RecordSchema` of `FieldSpec`s (type, options, validation).
- Store: `addRecord` / `updateRecord` / `deleteRecord` (`store.ts:522`) validate
  via `validate` (`schemas.ts:522`) and default via `defaultValues`.
- A **compile-time guard** (`schemas.ts:546`) asserts every `RecordCollection` is a
  real `ProductionData` array key — so a typo won't compile.

---

## 19. Notifications & activity log

- **Notifications** (`pages/Notifications.tsx`): `AppNotification` (`types:574`),
  typed (schedule_change, deadline_shifted, task_assigned, task_overdue,
  approval_requested/decided, ai_digest), optional `forRoles`, `linkTo` route.
  `addNotification`/`markNotificationRead`/`markAllRead`. Store actions raise
  them (PO advance, schedule publish, etc.).
- **Activity log** (`pages/ActivityLog.tsx`, admin-only): `ActivityLogEntry`
  (`types:611`) — who/what/when across ~20 entity types. `logActivity`
  (`store.ts:482`) auto-stamps user + time; called from mutating actions.
  Reachable from the `PresenceAvatars` admin popover.

---

## 20. Ask-the-production / NL query (`src/lib/snapshot.ts`)

- `buildSnapshot(d)` (`:41`) serializes the production for the `nl_query` /
  `aiAskProduction` feature. **No script text** (too big, structured data answers
  better) and a **hard char cap** (`SNAPSHOT_CHAR_CAP=30_000`): sections drop
  largest-first and the model is *told* what was dropped so it doesn't infer the
  production simply has none.

---

## 21. Cloud sync (`src/lib/cloud.ts`, `supabase/`) — ⚠️ off-limits for UI work

- One deployment = one **shared** team workspace. Env-gated
  (`VITE_SUPABASE_URL` + `_ANON_KEY`); otherwise every export is a no-op and the
  app is purely local.
- **Sign-in is derived**: Supabase Auth accounts come from the username +
  password hash; access is gated by the `workspace_members` roster
  (`join_workspace()` RPC re-checks server-side). See `supabase/schema.sql`.
- **Concurrency**: every push carries the `rev` it was based on; the server
  rejects a stale push → surfaced as a **conflict**, never silently clobbered.
  Non-force `pushWorkspace()` is blocked when `rev==null` ("Still syncing…"
  guard); **force must pass `true`** (CloudSync "Force upload").
- `useCloudStatus()` → `{ phase, dirty, conflict, live, onlineUsers, username }`.
  UI: `CloudIndicator`, `PresenceAvatars` (render only when cloud is live).
- **Does NOT import the store** (the store imports it) — talks to localStorage
  directly, calls back via `registerRehydrate`.

---

## 22. Backup / restore & bundled data (`src/lib/export.ts`)

- **Two file shapes**: full-workspace envelope `{state,version}` (many projects +
  users/roles), and single-project `{type:"scenetrackable-project",…}`.
- **Restore is ADDITIVE by default**: `importBackup(file)` detects shape,
  extracts project(s) (`projectsFromState`), `mergeProjects` folds them in
  (same-id updated, rest added, first becomes active) — **never touches other
  projects/users/roles**. `restoreFullBackup` is the DESTRUCTIVE replace, behind
  the "Replace everything…" control.
- `exportProject(pid?)` / `exportBackup()`.
- **Sample production**: `loadSampleProduction()` (Gift of the Magi, public
  domain) — `scripts/build-sample.mjs` → `public/sample-production.json`.
- **Bundled «مزرعة يدو ٣»**: `loadBundledProduction(id)` + `BUNDLED_PRODUCTIONS`;
  built by `scripts/build-yadoo.ts` which runs the committed extracted text
  through the app's *own* `parseScreenplay` + `parseBudgetText` (so it doubles as
  a regression check). Loaded additively.
  - Its **timeline is the production's real one**, not a generated offset:
    pre-production 2026-09-01, principal photography 2026-09-20 → 10-19
    (30 days), post-production 2026-09-21 → 11-19 (60 days, overlapping —
    §7.1). The constants sit at the top of the SCHEDULE block.
  - The board must land on **exactly 30 days**, but each of the 15 location
    units forces a day boundary regardless of page count, so a fixed
    pages-per-day cap can't hit the target. `buildBuckets(cap)` is therefore
    pure and the script **searches** caps 2→10 for the one yielding 30,
    falling back to the closest. If the parsers regress and the scene/location
    mix changes, this silently re-solves — check `days=` in its output.
- `ensureFreshDigest()` runs inside `applyBackupText` so restored data lands a
  completed AI digest (dashboard doesn't read "out of date").

---

## 23. Cross-cutting UI systems

- **Command palette ⌘K** (`components/CommandPalette.tsx`, mounted in
  MainLayout): indexes pages/scenes/cast/locations/props/handbook + actions.
- **Guided tour** (`components/TourOverlay.tsx`, steps in `data/tour.ts`): 15-step
  walkthrough; `data-tour="key"` anchors on real elements; progress persisted in
  store `tour:{running,stepIndex,completed}`. Add an anchor + a step when adding a
  page.
- **Help handbook** (`pages/Tutorial.tsx`, content `data/handbook.ts`, 22 docs);
  contextual `HelpButton`.
- **Theme** (`state/theme.tsx`): dark/light/system + View-Transitions circular
  reveal from the click point. **Appearance** (`lib/appearance.ts`): accent +
  density, applied in `main.tsx`.
- **Identity visuals**: `lib/identity.ts` (`gradientFor`, `initialsOf`) →
  `IdentityAvatar`, `ProjectPoster`. Shared coding: `lib/breakdownVisuals.ts`.

---

## 24. Universal share/export layer (`lib/pdfExport.ts`, `lib/share.ts`, `ui/ShareMenu.tsx`)

- **Real PDF generation** (`lib/pdfExport.ts`) is new: previously "PDF export"
  meant a browser print window (`reports.ts printReport`, still there,
  unchanged, still used by the Reports page's own "PDF" button). This module
  uses `jspdf` + `jspdf-autotable` to build an actual `.pdf` `Blob`/`File`.
  - `buildTablePdf(title, subtitle, table: ReportTable)` — reuses the same
    `ReportTable` shape `reports.ts` already produces, so a report has one
    definition and three output paths (CSV, print, real PDF).
  - `buildEntityPdf(title, subtitle, sections)` — single-record detail sheets
    (a scene, a location, a cast member, a wardrobe piece, an asset).
  - `downloadPdf`/`pdfBlob`/`pdfFilename`.
- **WhatsApp share** (`lib/share.ts`): `whatsappUrl(text)` /
  `openWhatsAppShare(text)` build the public click-to-chat link
  (`api.whatsapp.com/send?text=…`). **This is text-only — it cannot attach a
  file.** There is no client-only way to push a file into WhatsApp; that needs
  the WhatsApp Business Platform (Meta app review + a registered number + a
  server this app doesn't have), which is explicitly out of scope. When a
  share also has a PDF, the flow downloads the PDF first and tells the user to
  attach it manually — see `ShareMenu`'s `handleWhatsApp`.
  - Per-kind text builders: `buildSceneShareText`, `buildLocationShareText`,
    `buildCastShareText`, `buildWardrobeShareText`, `buildReportShareText`,
    `buildAssetShareText`.
  - `copyShareText` — clipboard write, used by the "Copy text" menu item.
- **`ShareMenu`** (`components/ui/ShareMenu.tsx`): the one dropdown component
  every page wires in — `{ buildText, buildPdf? }`, three actions (copy /
  WhatsApp / download PDF). Wired into: `Reports.tsx` (report), `Breakdown.tsx`
  (scene), `Locations.tsx` (location), `CastPortal.tsx` (cast member),
  `ArtPortal.tsx` (wardrobe/art element), `Drones.tsx` (asset). Adding it to
  another page/collection is: import `ShareMenu`, write a `buildText`
  (probably reusing/extending a `lib/share.ts` builder), optionally a
  `buildPdf` via `buildEntityPdf`.

---

## 25. Financial installments, vendors & the invoice AI pipeline

### 25.1 Data model
- `Vendor` (`types/index.ts`): name + `department: DepartmentId` + contacts.
  Generic-CRUD collection (`SCHEMAS.vendors`) — managed from the "Invoices" tab
  in `pages/Budget.tsx`.
- `Installment` + `PurchaseOrder.installments?` — see §13.
- `Invoice` (`types/index.ts`): one uploaded receipt. `fileDataUrl` is a base64
  data-URI — **the same "no real file-storage backend" convention** as
  `imageUrl`/`FileEntry` elsewhere in the app, not a new pattern. `status`:
  `uploaded → processing → parsed → reconciled`, or `error`.
- Both are required arrays on `ProductionData` (`vendors: Vendor[]`,
  `invoices: Invoice[]`) — the persist `migrate` step (from < 6) backfills
  `[]` onto every existing project (root + every `projectData[pid]`), because
  generic `addRecord` spreads `s[collection]` as an array and throws on
  `undefined`.

### 25.2 Upload → OCR → AI parse pipeline
The app's only AI model (Z.ai GLM `glm-4.7-flash`) has **no vision/image
input** — it can never read an uploaded photo or PDF directly. So "Process
Invoice with AI" is two steps, not one:
1. **Client-side text extraction** (`lib/ocr.ts`, new): `recognizeInvoiceText(file)`
   — a digital PDF goes through the existing `extractPdfText` (`lib/pdf.ts`,
   the same code the script importer uses); a photo goes through `tesseract.js`,
   **dynamically imported** so its wasm/worker bundle only loads when someone
   actually clicks the button.
2. **AI structuring** (`aiParseInvoice(ocrText, vendorHint?)` in `claude.ts`,
   feature id `invoice_parse`) — sends only the extracted text, never the
   image, and returns `{vendorName?, date?, total?, lineItems}`.
- Every field is reviewable/editable before it's saved — same "AI proposes,
  human commits" rule as everywhere else in the app.

### 25.3 Department buyer portals (`pages/InvoicePortal.tsx`, route `/invoices`)
- New access key `"invoices"` (`data/roles.ts` `ACCESS_KEYS`) + three new
  built-in roles: **Art Buyer** (`department:"art"`), **Wardrobe Buyer**
  (`department:"wardrobe"`), **Production Buyer** (`department:"production"`),
  each write-only on `invoices` — same department-scoped-role pattern as
  `camera`/`rf_comms`/`vfx`/`art`/`cast`. The page locks the invoice's
  department to `currentRole().department` when the role carries one.
- Store actions: `uploadInvoice` (creates, status `"uploaded"`),
  `updateInvoiceParse` (writes OCR text + parsed fields, or an error),
  `reconcileInvoice(id, {linkedBudgetLineId?, linkedPOId?})`.

### 25.4 Reconciliation — deliberately does not touch the budget
- **`reconcileInvoice` only links records** (`linkedBudgetLineId`/`linkedPOId`
  + `status:"reconciled"`). **It never mutates `budgetLines.spent` or a PO's
  `installments`.** Reconciliation is done from `pages/Budget.tsx`'s
  "Invoices" tab (all departments, `budget` access key).
- **Why**: the finance dashboard (`computeFinanceSummary`, `lib/metrics.ts`)
  answers a different question than the existing top-sheet metrics
  (`computeMetrics`'s budgeted/committed/spent) — "what's been paid via
  tracked installments/invoices" vs. "what the top sheet says". Mixing the two
  — e.g. auto-incrementing `spent` when an invoice reconciles — would
  double-count the same money under two different names. If a future task
  wants automatic reconciliation, it needs an explicit decision about which
  number wins, not a silent write.
- `computeFinanceSummary(d)` → `{totalBudget, totalPaidInstallments,
  totalPendingInstallments, byDepartment[], byVendor[]}`. Rendered in
  `Budget.tsx`'s "charts" tab and as one `StatCard` on the accountant
  Dashboard.

---

## 26. Schedule documents — the two sheets a production circulates
### (`src/lib/scheduleExports.ts`, Schedule page → "Documents" tab)

Modelled on the two spreadsheets this production actually works from, so an
export drops straight into the existing paperwork instead of inventing a
format. Both are built from the same store slices the strip board reads, so
**they can never drift from the board**.

1. **Location Schedule — «الجدول الزمني»** (`buildLocationScheduleTable`).
   One row per *run of consecutive shoot days at one location*, grouped by
   `locationBlocks(d)`. **Consecutive is the whole point**: «عدد الايام» in the
   source sheet is the length of an unbroken stay, so a location revisited
   later is correctly a second row, not a fatter first one. Columns mirror the
   sheet (bilingual headers, Arabic first): location-per-script, place,
   operation, start, end, map link, day count, crew, cast, description,
   Day/Night, INT/EXT. `locationScheduleSummary` reproduces the sheet's
   footer block (first/last shoot day, day count, the timeline boundaries).
2. **General Calendar — «الجدول الزمني العام»** (`buildGeneralCalendarTable`).
   One row per *calendar day* across `calendarWindow(d)` — earliest known
   boundary to latest, so a half-filled timeline still exports something
   usable. Per day: prep / shoot (with day number) / post / off.
   **Shoot and post are independent tests, not an if/else chain** — a day can
   be both, and prints as «تصوير + مونتاج», matching the real sheet (§7.1).

- **Counts are measured, never estimated** — same rule as `metrics.ts`. Crew is
  the real crew-list length, cast is the distinct cast actually in that block's
  scenes; anything unmeasurable renders `—`.
- **CSV** (`exportScheduleCSV`) is a true download and reuses `reports.ts`'s
  `tableToCSV` — which prepends a UTF-8 BOM, the thing that makes Arabic open
  correctly in Excel. The location schedule appends its summary block below the
  table.
- **PDF** (`printScheduleDocument`) is the **print-window path, deliberately —
  not `lib/pdfExport.ts`'s jsPDF path.** jsPDF ships no Arabic glyphs and does
  no Arabic shaping or bidi reordering, so an Arabic schedule comes out of
  `buildTablePdf` as disconnected letters in reverse order. The browser's own
  print engine shapes and orders Arabic correctly and keeps the text
  selectable. The document is emitted `dir="rtl"`, A4 landscape.
  **`buildTablePdf` remains correct for Latin tables (§24) — don't "fix" this
  by routing these two through it.**

---

## 27. Symptom → where to look

| Symptom | Start here |
|---|---|
| Imported budget total ≠ uploaded file | §12.4; run `budget-test.ts` on the file |
| Budget row filed under wrong section | `SECTION_RULES` order, `budgetImport.ts:118` |
| Amount read backwards | `parseAmount` `budgetImport.ts:187` + `ltrGroups` `pdf-lines.ts:196` |
| Arabic text scrambled / words split | `pdf-lines.ts` `renderLine`/`spaced`/`clean` |
| Screenplay split into phantom/duplicate scenes | `parseScreenplay` episode logic `script.ts:284`; `ltrGroups` |
| Scene heading not detected | `matchHeading` `script.ts:225` (which of the 4 Arabic forms) |
| Wrong location/time on a scene | `splitHeading`/`splitSlashHeading` `script.ts:164` |
| AI answers in wrong language | `languageDirective` `lang.ts:156` |
| Cast/location names not matching across pages | `lib/locations.ts` (`locKey`, aliases, `resolveLockDates`) |
| Deadline not updating after schedule change | `recomputeAllDeadlines` `store.ts:1016`; `evaluateDeadline` |
| Dashboard KPI shows "—"/undefined | It's genuinely unmeasurable — `metrics.ts` (`Maybe`) |
| Dashboard number looks made-up | It isn't anymore — trace the reducer in `metrics.ts` |
| Task/PO/anything dropped silently | store filter in its action; or a `remove` in a modal |
| AI run cancelled on navigation | It shouldn't — it's a tracked `aiJob` (§17), not component state |
| Restore replaced/added the wrong things | `export.ts` additive `importBackup` vs destructive `restoreFullBackup` |
| Wrong currency | `detectCurrency` `budgetImport.ts:285` + `importBudgetLines` |
| PO stuck / wrong approver | `advancePO` chain `store.ts:1181`; `POStatus` `types:307` |
| A page 403s for a role | `permissionFor` `types:66`; `AccessGuard` `App.tsx` |
| New record type needs a form | Add a schema in `data/schemas.ts`; use `addRecord`/`RecordEditor` |
| WhatsApp share doesn't attach a file | It can't — `api.whatsapp.com` is text-only; §24 |
| Invoice "Process with AI" fails / times out | Check OCR first (`lib/ocr.ts` — is the file actually text-bearing?), then the GLM call itself; the model never sees the image |
| Reconciled invoice didn't change the budget top sheet | Correct — `reconcileInvoice` only links records, §25.4 |
| Installment stuck showing "pending" past its due date | "overdue" is computed at render time, never persisted — check the component, not the store |
| Scene shows as scheduled but "not shot" won't clear | `shotStatus` lives on `Scene`, independent of `ShootDay.scenes` — moving a scene between days doesn't change it |
| AI continuity move looks wrong or got rejected | `validateContinuityMoves` in `lib/continuity.ts` — check location lock dates / principal-photography window first |
| Arabic comes out as disconnected/reversed letters in a PDF | jsPDF can't shape Arabic — use the print-window path, §26 |
| Shoot day dates wrong / off by one | `alignShootDayDates` + `addDaysIso` (UTC-based on purpose), §7.1 |
| Exported schedule disagrees with the strip board | It can't — both read the same store slices; check the `data` memo's slice list in `ScheduleDocuments` |
| Post-production dates look like they overlap the shoot | They're meant to — `postProductionStart` is independent of wrap, §7.1 |

---

## 28. Node repro scripts & guard rails

```bash
npx tsx scripts/budget-test.ts <file.pdf|csv>   # budget parse + reconciliation, row by row
npx tsx scripts/pdf-lines-test.ts               # RTL line-reconstruction fixtures
npx tsx scripts/arabic-pdf-repro.ts             # Arabic PDF extraction repro
npx tsx scripts/build-yadoo.ts                  # rebuild bundled production (regresses both parsers)
node  scripts/build-sample.mjs                  # regenerate the sample production
```

`scripts/schedule-export-test.ts` prints both §26 documents for a production
JSON. It **can't run under plain `tsx`**: it reaches `lib/locations.ts`, which
imports the store, which imports `cloud.ts`, which reads `import.meta.env` at
module scope — Vite-only. Bundle it first (esbuild comes with Vite):

```bash
npx esbuild scripts/schedule-export-test.ts --bundle --platform=node --format=esm --target=node20 "--define:import.meta.env={}" --outfile=tmp/sched-test.mjs && node tmp/sched-test.mjs public/mazraat-yadoo-3.json
```
Fixtures in `scripts/data/`. `src/lib/pdf.ts` can't load outside Vite — the
scripts load pdf.js directly and hand text to `reconstructLines`, the same code
the app runs.

**Guard rails:**
- **Do not touch** `lib/claude.ts`, `lib/cloud.ts`, `supabase/` unless the task is
  explicitly AI/cloud.
- **`npm run build`** (`tsc -b && vite build`) must stay green.
- Colours come from CSS variables in `src/index.css` — never hardcode.
- After changing a parser, re-run its Node repro against the real fixture.
- Match surrounding comment density — the parsing modules comment the *why*
  heavily; keep that up.
