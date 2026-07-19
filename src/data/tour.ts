// ============================================================
// GUIDED TOUR — steps for the spotlight overlay.
//
// Each step names a route to be on and, optionally, a live element to spotlight
// (via `data-tour` attributes on the real UI). The tour walks the whole product
// tab by tab on a sample production: dashboard → breakdown → schedule → DOOD →
// reports → budget → tasks → locations, so an investor sees the full surface.
// ============================================================

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** Page the tour should be on for this step. */
  route: string;
  /** `[data-tour="..."]` key of the element to spotlight. Omit to center. */
  target?: string;
  /** Optional deep link for a "Try it" button. */
  tryLabel?: string;
  tryRoute?: string;
  /** Extra padding around the spotlight, px. */
  pad?: number;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to SceneTrackable",
    body: "This tour walks the whole product on the real app using a sample production — the O. Henry short 'The Gift of the Magi'. Take it tab by tab; you can leave any time and pick up where you left off.",
    route: "/dashboard",
  },
  {
    id: "sidebar",
    title: "Everything lives in the sidebar",
    body: "Departments, production tools and admin are grouped here. It expands on hover, or pin it open. Your role decides what's visible — a camera assistant and a producer see different apps.",
    route: "/dashboard",
    target: "sidebar",
  },
  {
    id: "switcher",
    title: "Switch productions here",
    body: "Each project is a whole production with its own script, cast, schedule and budget. The switcher shows live scene and element counts, and a poster you can't mistake for another show.",
    route: "/dashboard",
    target: "project-switcher",
  },
  {
    id: "workspace-status",
    title: "Live presence & cloud sync",
    body: "Green avatars are teammates online right now — click them for the roster. Next to them the AI pill tracks any running AI job, and the cloud pill shows sync state. Everything saves and syncs automatically; open it to sync on demand.",
    route: "/dashboard",
    target: "workspace-status",
    pad: 6,
  },
  {
    id: "palette",
    title: "Jump anywhere with ⌘K",
    body: "Press ⌘K (Ctrl-K) to fuzzy-jump to any scene, character, prop or page — or run an action like re-running a scene, exporting the DOOD or toggling the theme. It's the fastest way around the app.",
    route: "/dashboard",
  },
  {
    id: "dashboard",
    title: "The production at a glance",
    body: "A composite health score, shooting pace vs. plan, and spend charts — plus an AI daily digest that reads the whole production and calls out the critical path. Ask-the-production answers plain-English questions from the live data.",
    route: "/dashboard",
    target: "page-header",
  },
  {
    id: "breakdown",
    title: "The breakdown is the heart of it",
    body: "Every scene, every element — cast, props, wardrobe, SFX, VFX and more — editable and colour-coded. Upload a screenplay and the AI splits scenes on the sluglines and fills this in live, scene by scene.",
    route: "/breakdown",
    target: "page-header",
    tryLabel: "Open Breakdown",
    tryRoute: "/breakdown",
  },
  {
    id: "schedule",
    title: "Build the schedule by dragging",
    body: "Drag scenes onto shoot days on the strip board. Columns light up as you hover, a day can span locations for a company move, and days over your pages-per-day target are flagged. Or let the AI draft the whole board grouped by location.",
    route: "/schedule",
    target: "page-header",
    tryLabel: "Open Schedule",
    tryRoute: "/schedule",
  },
  {
    id: "dood",
    title: "Day Out of Days",
    body: "Switch to the DOOD tab on this page for the classic cast × day grid — start / work / hold / finish per person. Seed it straight from the schedule, or have the AI draft it, then publish call sheets from it.",
    route: "/schedule",
  },
  {
    id: "reports",
    title: "Real production paperwork",
    body: "Reports generates call sheets, the Day Out of Days, and breakdown exports styled like the documents a real production runs on — as CSV for the office or print-ready PDFs. The AI can even narrate any report.",
    route: "/reports",
    target: "page-header",
    tryLabel: "Open Reports",
    tryRoute: "/reports",
  },
  {
    id: "budget",
    title: "Budget & accounting",
    body: "Track the budget line by line against actuals, with purchase orders and petty cash flowing through an approval chain. Spend pressure feeds straight back into the dashboard health score.",
    route: "/budget",
    target: "page-header",
  },
  {
    id: "tasks",
    title: "The task engine",
    body: "A kanban across every department with dependencies and auto-computed deadlines — location locks, permit sign-offs, fittings. The AI proposes the tasks a production of this shape usually needs.",
    route: "/tasks",
    target: "page-header",
  },
  {
    id: "locations",
    title: "The location bible",
    body: "Every scene heading consolidated into the real places you scout, with permits, lock dates, maps and scene lists. One AI pass rebuilds it from the script, and a scout brief drafts the notes for each place.",
    route: "/locations",
    target: "page-header",
  },
  {
    id: "help",
    title: "Help is everywhere",
    body: "The ? on any page opens that feature's handbook entry, and the Help hub has a searchable page for every area. You can relaunch this tour any time from your user menu.",
    route: "/dashboard",
  },
  {
    id: "done",
    title: "That's the tour",
    body: "Explore freely — it's all real, editable, cloud-syncable data. Load the sample again, upload your own, or start a fresh production from the Projects page whenever you're ready.",
    route: "/dashboard",
  },
];
