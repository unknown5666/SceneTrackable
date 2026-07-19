# SceneTrackable — Agent Fast-Start Brief

**Paste this at the start of a new chat so I skip re-learning the codebase and go straight to work.**
Read `POLISH-CHECKLIST.md` (same folder) for the live task status — it's the source of truth for what's done/left.

---

## What this is
**SceneTrackable** — an AI script-breakdown SaaS for film production. Upload a screenplay → AI splits scenes on
INT./EXT. headings → produces a full breakdown (cast, props, wardrobe, SFX/VFX, locations, etc.) → feeds schedule,
DOOD, budget, tasks, departments, reports. Rebranded from an earlier "Production OS".

## Stack & commands
- Vite + React 18 + TypeScript + Tailwind + Zustand (persisted) + react-router v6 + **Framer Motion** + dnd-kit + Recharts.
- Windows dev box. Shell = PowerShell (primary) or Git Bash (Bash tool). Node scripts via `node`.
- **Build/verify:** `npm run build` (runs `tsc -b && vite build`). Keep it green after every change.
- `tsconfig` has `noUnusedLocals: false` / `noUnusedParameters: false` — unused imports won't fail the build (but tidy anyway).
- **No browser preview** — the user wants code-only work; verify with `npm run build`, not the dev server.

## Design system (single source of truth — DO NOT hardcode colors)
- CSS variables in `src/index.css` under `[data-theme="dark"|"light"]`. Tailwind maps them (`tailwind.config.js`):
  `--bg-base/surface/surface-hover/elevated`, `--border-default/hover`, `--text-primary/secondary/muted`,
  `--accent-blue`, `--color-success/warning/danger/ai`, `--active-tint`, `--row-hover`, etc.
- Radii tokens: `rounded-card` (12px), `rounded-button` (8px), `rounded-badge` (6px).
- **UI primitives in `src/components/ui/`** — reuse, don't reinvent: `Button, Card (has `glow` prop), Modal (animated),
  Badge/StatusBadge, StatCard (auto count-up numeric values, `glow` prop), Tabs, EmptyState (+ `GhostRows`, `preview`),
  Skeleton, ProgressBar, CountUp, DataTable, SceneHeading/IntExtBadge/TimeBadge, ProjectPoster, IdentityAvatar,
  HelpButton, LoadSampleButton, Toaster`.
- Layout in `src/components/layout/`: `MainLayout, TopBar, Sidebar, CloudIndicator, AIStatusPill, PresenceAvatars, Footer`.
  Top-bar right cluster (all in a `data-tour="workspace-status"` wrapper) is **interactive**: `PresenceAvatars` = clickable
  online-teammate popover (green-ringed identity avatars + admin "View activity log"); `AIStatusPill` = running-AI-job ring
  + detail popover; `CloudIndicator` = sync-state pill + popover with headline, last-synced, "Sync now" and "Cloud settings"
  (a conflict routes straight to `/admin?tab=cloud`). Presence/cloud only render when cloud is env-enabled + live.
- **Motion:** shared variants in `src/lib/motion.ts` (`pageVariants, staggerContainer/Item, menuVariants, modalPanelVariants,
  backdropVariants, chipVariants`, `SPRING/POP/EASE`). Rules: 150–250ms, subtle, always respect `prefers-reduced-motion`
  (`useReducedMotion()` from framer, or the global reduced-motion CSS in index.css).
- **Shared visual coding:** `src/lib/breakdownVisuals.ts` = `CATEGORY_META` (element category colors), `TIME_COLORS`/`timeChip`,
  `INTEXT_COLORS`/`intExtChip`. Use these everywhere day/night + INT/EXT + element category appears.
- **Identity gradients:** `src/lib/identity.ts` (`gradientFor(id)`, `initialsOf`) → `IdentityAvatar` + `ProjectPoster`.

## State (Zustand)
- One store: `src/state/store.ts`, persisted to localStorage key **`scenetrackable-v1`**, version **5**, shape
  `{ state: {...}, version }`. `partialize` strips only `aiJobs` (transient).
- Active project's `ProductionData` is spread at the **top level** of state; other projects snapshotted in `projectData`.
  Types in `src/types/index.ts` (`ProductionData` lists every collection). `blankData()`/`DATA_KEYS` in store define the set.
- Auth: seeded master **Admin / 1234** (sha256 hashed). Roles are data-driven (`src/data/roles.ts`), per-page
  `permissions: none|read|write`; `access` is DERIVED from permissions (never author it). Admin role = `["all"]`.
- Theme: `src/state/theme.tsx` — `useTheme()` → `{ theme, pref, toggle(origin?), setTheme, setPref }`. Supports
  dark/light/**system**. Theme changes do a **View Transitions circular reveal** from the click point (pass `{x,y}`).
- Appearance (accent + density): `src/lib/appearance.ts`, applied in `main.tsx`. Accent overrides `--accent-blue`/`--active-tint`;
  density sets `data-density` on `<html>`.
- Toasts: `src/lib/toast.ts` (framework-agnostic `pushToast`, outside the store so it never cloud-syncs) + `ui/Toaster.tsx`.
  Store deletes call `pushToast` with an **Undo** action.
- Cloud sync: `src/lib/cloud.ts` (Supabase, env-gated `VITE_SUPABASE_URL`/`_ANON_KEY`). `useCloudStatus()` →
  `{ phase, dirty, conflict, live, onlineUsers, username }`. **Do NOT change cloud/AI logic unless the task says so.**

## AI
- `src/lib/claude.ts` = provider (Z.ai GLM only, key hardcoded/public free tier; 15 RPM; error 1113 = allowance gone, permanent).
  No key → intelligent demo fallback. **Treat `claude.ts` + `cloud.ts` + `supabase/` as off-limits for UI work.**
- Orchestration is `src/lib/script.ts` (`runBreakdown(scenes, onProgress, projectName, onSceneDone)`) — this IS editable.
  Breakdown job tracked in store `aiJobs` (`aiJobBegin/Progress/PauseLimit/Done/Fail/Reset`, selector `activeAIJob`,
  `job.progress = {done,total}`).

## Big things already built (this project = an investor-demo UI/UX polish pass)
- **Breakdown theater** (`components/breakdown/BreakdownTheater.tsx`) — live scene grid + `TheaterSummary`, wired in `Projects.tsx`.
- **Sample production** — `scripts/build-sample.mjs` generates `public/sample-production.json` (O. Henry "Gift of the Magi",
  public domain). Regenerate: `node scripts/build-sample.mjs`. Loaded via `loadSampleProduction()` (`src/lib/export.ts`) →
  same restore path as an Admin backup → reloads → cloud-syncs. `LoadSampleButton` on Projects empty state + Login.
- **Command palette** ⌘K — `components/CommandPalette.tsx` (mounted in MainLayout). Indexes pages/scenes/cast/locations/props/
  handbook + actions. Scene deep-link `?scene=<id>` + `?action=rerun` handled in `Breakdown.tsx`.
- **Help hub** — `pages/Tutorial.tsx` (tabs: Guided tour + Feature handbook). Tour overlay = `components/TourOverlay.tsx`
  (custom spotlight, steps in `data/tour.ts`, `data-tour="..."` anchors on real elements, progress persisted in store
  `tour:{running,stepIndex,completed}`). Handbook content = `data/handbook.ts` (22 docs). Contextual `HelpButton` ("?").
  - **Tour is a full 15-step tab-by-tab investor walkthrough**: welcome → sidebar → switcher → workspace-status → ⌘K →
    dashboard → breakdown → schedule → DOOD → reports → budget → tasks → locations → help → done. Steps with no `target`
    center; steps with a `target` spotlight a live `data-tour` anchor. `page-header` anchors now exist on Dashboard,
    Breakdown, Schedule, Reports, Budget, Tasks, Locations; plus `sidebar`, `project-switcher`, `workspace-status`.
    TourOverlay navigates to `step.route` and polls ~40 rAF for the anchor, gracefully centering if it never mounts.
- **AI panes read "done" after any restore** — `ensureFreshDigest()` in `export.ts` runs inside `applyBackupText` (shared by
  `importBackup` + `loadSampleProduction`), so uploading dummy data or the sample lands a completed AI daily digest: a
  curated `aiDigest.text` in the file is kept (hash just re-stamped so the dashboard doesn't flag it "out of date"), and a
  file without one gets a synthesized `demoDigest`. Empty digest state now reads "AI summary pending". Sample also ships
  `aiUsage` + `aiDigest` (see `scripts/build-sample.mjs`).
- **Admin console** = tabbed (Users&Roles | AI | Cloud | Data). `/ai` `/cloud` are redirects to `/admin?tab=…`.
  `AISettings`/`CloudSync` take an `embedded` prop.
- **Settings** (`/settings`, `pages/Settings.tsx`) — theme preview cards, accent swatches, density.

## Tables (design-system decision — P3 #14)
- **`.pos-table` (in `index.css`) is the canonical shared table** — used on every page, each wrapped in `overflow-x-auto`.
  Gives sticky header, hover, **zebra** (`nth-child(even)` → `--row-alt`) and **compact-density** padding. It's the right
  fit for the app's matrix/expandable tables (Timesheet, DOOD, Locations, Reports) that a flat column API can't model.
- **`ui/DataTable.tsx`** is the flat-list/async variant, brought to visual parity (`even:` zebra + `st-datatable`
  compact-density rule). All page data is synchronous, so its loading/error surfaces are for future async tables. Don't
  force-migrate working `pos-table`s — adopt `DataTable` only for genuinely flat, async lists.

## Schedule strip board (P3 #15/#24) — `pages/Schedule.tsx`
- Each shoot-day column is a `DayColumn` with a real dnd-kit `useDroppable` (`id="day_N"`), so scenes drop onto **empty**
  days (not only onto strips) and the column lights up while hovering (`isOver` → ring + tint + "Release to add"). Days
  over `production.plannedPagesPerDay` show an **over-target** warning badge. `SceneStrip` + the `DragOverlay` ghost use the
  shared `intExtChip`/`IntExtBadge`/`TimeBadge` coding. Strip board grid + Tasks kanban scroll in their own `overflow-x-auto`.

## Conventions / gotchas
- Reference files as clickable links in replies. Match surrounding code style; keep comment density similar.
- Add `data-tour="key"` when a new element should be tour-spotlightable (and, if it's a page, a step in `data/tour.ts`).
- When adding a page, register the route in `src/App.tsx` (under `<MainLayout>`, wrap with `AccessGuard`/`AdminGuard` as needed)
  and add a handbook doc in `data/handbook.ts` if it's a feature area.
- Deletes should `pushToast` with Undo (see store `deleteRecord`/`deleteTask`/`removeCastMember` for the pattern).
- Currency default AED. Dates: convert relative → absolute when persisting sample/demo data.
- Persisted-state additive fields are safe (zustand merges initial over missing persisted keys) — no version bump needed for adds.

## Status
- **P1, P2, P3 all ✅ complete** (`POLISH-CHECKLIST.md` has the detail + build log). Plus the top-bar interactivity,
  restore-digest, and expanded tour from the latest pass. `npm run build` green.

## How to resume
1. Open `POLISH-CHECKLIST.md` for status; the checklist is the source of truth for what's done.
2. Do the work using the primitives above; keep tokens as the styling source of truth.
3. `npm run build` must stay green; update the checklist; don't touch AI/cloud logic (`claude.ts`/`cloud.ts`/`supabase/`).
