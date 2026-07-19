# SceneTrackable — Investor-Demo Polish Pass · Progress Checklist

Living status doc. **UI/UX only** — no backend/cloud/AI logic changes except where the task allows.
Legend: ⬜ todo · 🟡 in progress · ✅ done · ⏭️ deferred/partial

Rules being followed: motion 150–250ms, respect `prefers-reduced-motion`, reuse primitives, CSS-var tokens
as single source of truth, keep `npm run build` green after every phase.

---

## Setup
- ✅ Install `framer-motion` (^11)
- ✅ Baseline `npm run build` green
- ✅ This checklist created

---

## P1 — Demo wow moments
- ✅ **1. Breakdown theater** — live progress panel during AI run: scene cards queued→analyzing→done,
  element chips animate in, running counters, stagger-reveal, springy count-up summary card, one shimmer. No confetti.
  - Built `CountUp` (`src/components/ui/CountUp.tsx`), `motion.ts` variants, `breakdownVisuals.ts` (shared category/time/int-ext colors).
  - Added optional `onSceneDone` to `runBreakdown` (script.ts — orchestration, allowed) for real live element reveal.
  - `BreakdownTheater` + `TheaterSummary` in `src/components/breakdown/`; wired into Projects.tsx running/done stages.
- ✅ **2. Sample production** — `public/sample-production.json` (O. Henry "Gift of the Magi", 1905, public domain).
  Generator: `scripts/build-sample.mjs` (`node scripts/build-sample.mjs` to regen). 10 scenes/56 elements, cast, crew,
  4 locations, 3 shoot days (multi-location company moves), DOOD, 9 tasks, 8 budget lines, 3 POs, VFX, RF, camera,
  drone, art, timesheet, notifications, activity log, health history, AI digest. Loader `loadSampleProduction()` in
  export.ts (fetch→same restore path→reload→cloud-syncs). `LoadSampleButton` on Projects empty state + Login card.
- ✅ **3. Command palette (⌘K)** — `src/components/CommandPalette.tsx`, mounted globally in MainLayout. Fuzzy scorer,
  keyboard nav, animated grouped results. Indexes pages, scenes, cast/characters, locations, props/elements, handbook,
  + actions (re-run scene, export CSV, print sheets, export DOOD, toggle theme, sign out). Scene deep-link
  `?scene=<id>` + `?action=rerun` handled in Breakdown.tsx (runAI refactored to accept a target scene).
- ✅ **4. Help hub (tour + docs)** — rebuilt `Tutorial.tsx` as tabbed Help hub:
  - ✅ 4a Guided tour — `TourOverlay.tsx` (custom spotlight, no lib) mounted globally; `data/tour.ts` steps; walks
    Dashboard→sidebar→switcher→⌘K→Breakdown→Schedule→Reports. Persisted in store (`tour:{running,stepIndex,completed}`
    + actions). Loads sample first (resume flag in MainLayout). `data-tour` anchors on sidebar/switcher/page-headers.
    Relaunch from user menu.
  - ✅ 4b Feature handbook — `data/handbook.ts` (22 docs, structured TS), TOC + search + doc view w/ steps/tips/"Go there".
    Command palette also searches it. Contextual `HelpButton` ("?") wired into Breakdown/Schedule/Reports headers
    (more during #14).

### ✅ P1 COMPLETE — build green.

## P2 — Motion system (Framer Motion) — shared variants in `src/lib/motion.ts`
- ✅ **5. Route transitions** (MainLayout AnimatePresence keyed on pathname) + card-grid stagger (Projects grid).
  ⏭️ Dashboard/Breakdown-list stagger folded into #14 sweep.
- ✅ **6. Sidebar** shared `layoutId="sidebar-active-pill"` slides between items (spring). ⏭️ group-expand height spring skipped (no collapsible groups).
- ✅ **7. Exit animations** — Modal rewritten w/ AnimatePresence scale+fade (drawer slides) + backdrop blur;
  all 3 TopBar dropdowns wrapped in AnimatePresence w/ `menuVariants`.
- ✅ **8. Theme switch** — View Transitions circular reveal from click point (theme.tsx `applyWithReveal` + flushSync;
  CSS suppresses default cross-fade). Theme now also supports "system" (for #17). Origin passed from TopBar/Login.
- ✅ **9. AIStatusPill** — new `AIStatusPill.tsx`: SVG progress ring from `job.progress`, breathing violet glow,
  morph to green check (holds 2s), click opens detail popover w/ "Go to run".
- ✅ **10. Notification bell** — spring badge pop (keyed) + ring-wiggle on new arrival; Notifications page mark-all-read
  = top-down 40ms staggered dot fade.
- ✅ **11. Cursor-glow on Card** — `glow` prop + `.st-card-glow` radial highlight via `--x/--y` (Projects cards; extend to Dashboard in #14).
- ✅ **12. Login** — `.st-animated-gradient` + `.st-grain`, global input focus glow, submit morph spinner→check, card shake on wrong pw.
- ✅ **13. Numbers** — `CountUp` (rAF, reduced-motion aware). StatCard auto-counts numeric values; project switcher counts.
  ⏭️ DOOD totals / more count-ups as those surfaces are touched in P3.

### ✅ P2 COMPLETE — build green.

## P3 — Consistency & structure
- 🟡 **14. Design-system sweep** — shared `DataTable` built (`ui/DataTable.tsx`: sticky header, hover rows, tabular-nums,
  Skeleton loading / EmptyState empty / friendly error+retry, scroll container). Dashboard stat grid now stagger + glow
  (StatCard gained `glow` prop). ⏭️ rolling `DataTable` out to every page's tables + full spacing/header-pattern sweep deferred.
- 🟡 **15. Typography** — `ui/SceneHeading.tsx` (mono slugline + `IntExtBadge`/`TimeBadge`) on shared `breakdownVisuals`
  color coding; applied in Breakdown scene detail. ⏭️ reuse across Schedule/DOOD/Reports rows deferred.
- ✅ **16. Admin console consolidation** — `Admin.tsx` now tabbed (Users & Roles | AI | Cloud | Data). AI/Cloud render
  `<AISettings embedded>` / `<CloudSync embedded>`; Data tab = backup/restore + activity-log link. `/ai` `/cloud` are
  `<Navigate>` redirects to `/admin?tab=…`. Sidebar bottom trimmed (Help, Settings, Admin). CloudIndicator → `/admin?tab=cloud`.
- ✅ **17. New `/settings` page** — `Settings.tsx`: theme preview cards (light/dark/system → #8 reveal), 6-swatch accent,
  density toggle. `lib/appearance.ts` (accent→`--accent-blue`/`--active-tint`, density→`data-density`, applied in main.tsx).
  Sun/Moon removed from TopBar; user dropdown has Settings + Help & tutorial. Theme supports "system".
- ✅ **18. Toast system** — `lib/toast.ts` (framework-agnostic queue) + `Toaster.tsx` (top-right, AnimatePresence). Wired
  into store deletes with **Undo** (deleteRecord, deleteTask, removeCastMember restore at original index).
- ✅ **19. Presence avatars** — `lib/identity.ts` (deterministic 2-hue gradient + initials), `IdentityAvatar` + `ProjectPoster`.
  `PresenceAvatars` (Figma-style overlapping bubbles from `CloudStatus.onlineUsers`) in TopBar; avatar in user menu.
  ⏭️ extend avatars into tasks/activity/DOOD rows during those touches.
- ✅ **20. Error states** — Breakdown AI failure now a friendly recovery card (rate-limit-aware copy + "Retry scene N",
  reassures existing breakdown untouched). DataTable has a built-in error+retry surface. CloudIndicator already renders
  explicit synced/syncing/pending/offline/conflict via `describe()`.
- ✅ **21. Project switcher** — `ProjectPoster` gradient posters in switcher trigger + dropdown + Projects cards;
  dropdowns scale-fade from origin corner (menuVariants).
- ✅ **22. Empty states** — `EmptyState` upgraded (framed gradient icon, optional `preview` ghost illustration + `GhostRows`
  helper) — improves every empty state at once; Tasks empty state showcases the ghost preview. "Never No data yet." copy.
- ✅ **23. Breakdown ergonomics** — filter chips + inline edit (already existed) + **J/K scene nav** (ignores form fields).
  Command palette re-run deep-links too. ⏭️ right-side inspector / multi-select bulk deferred (larger).
- 🟡 **24. Schedule drag** — dnd-kit already wired. ⏭️ drop-zone highlight / ghost preview / snap / double-booking warning
  deferred (Schedule.tsx is large; not yet touched).
- ✅ **25. Print/export** — breakdown sheets + call sheet + reports/DOOD already Georgia-serif industry paperwork with
  production name/date; added date + "Sheet n of N" page headers to breakdown sheets. Print docs are standalone → light forced.
- 🟡 **26. Responsive** — foundation already solid (sidebar collapses <lg, MainLayout margin responsive, tables in
  `overflow-x-auto`, grids use responsive cols, DataTable scrolls in its container). ⏭️ no dedicated 1024px audit run (no-browser).

---

## Build log
- (baseline) `npm run build` ✅ green — 7.85s, framer-motion added.
- After P1 (theater, sample, palette, help hub) ✅ green — 7.24s.
- After P2 (motion system) ✅ green — 7.45s.
- After P3 #16-19,21 (admin/settings/toast/avatars/posters) ✅ green — 7.07s.
- After P3 #15,20,22,23,25 + #14 partial (DataTable, dashboard glow/stagger, empty states, print) ✅ green — 7.50s.

## Notes / decisions
- Design tokens: CSS vars in `src/index.css` on `[data-theme]`. Tailwind maps them (tailwind.config.js).
- UI primitives in `src/components/ui/`. Reuse, don't reinvent.
- Restore path: `importBackup(File)` in `src/lib/export.ts` writes localStorage `scenetrackable-v1` + reloads.
- AI job model in store: `aiJobs: Record<string, AIJobState>`, actions `aiJobBegin/Progress/PauseLimit/Done/Fail/Reset`,
  selector `activeAIJob`. `job.progress = { done, total }`.
- Theme: `useTheme()` from `src/state/theme.tsx` (dark|light only today; #17 adds "system").
