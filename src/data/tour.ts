// ============================================================
// GUIDED TOUR — steps for the spotlight overlay.
//
// Each step names a route to be on and, optionally, a live element to spotlight
// (via `data-tour` attributes on the real UI). The tour walks the hero flow:
// load the sample → Breakdown → Schedule → DOOD/Reports.
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
    body: "This quick tour walks the hero flow on the real app using a sample production. You can leave any time and pick up where you left off.",
    route: "/dashboard",
  },
  {
    id: "sidebar",
    title: "Everything lives in the sidebar",
    body: "Departments, production tools and admin are grouped here. It expands on hover, or pin it open. Your role decides what's visible.",
    route: "/dashboard",
    target: "sidebar",
  },
  {
    id: "switcher",
    title: "Switch productions here",
    body: "Each project is a whole production. The switcher shows scene and element counts, and a poster you can't mistake for another show.",
    route: "/dashboard",
    target: "project-switcher",
  },
  {
    id: "palette",
    title: "Jump anywhere with ⌘K",
    body: "Press ⌘K (Ctrl-K) to fuzzy-jump to any scene, character, prop or page — or run an action like re-running a scene or exporting the DOOD.",
    route: "/dashboard",
  },
  {
    id: "breakdown",
    title: "The breakdown is the heart of it",
    body: "Every scene, every element — cast, props, wardrobe, SFX, VFX and more — editable and color-coded. Upload a script and the AI fills this in live.",
    route: "/breakdown",
    target: "page-header",
    tryLabel: "Open Breakdown",
    tryRoute: "/breakdown",
  },
  {
    id: "schedule",
    title: "Build the schedule by dragging",
    body: "Drag scenes onto shoot days. A day can span multiple locations for a company move, and double-booked cast raise a warning.",
    route: "/schedule",
    target: "page-header",
    tryLabel: "Open Schedule",
    tryRoute: "/schedule",
  },
  {
    id: "reports",
    title: "Real production paperwork",
    body: "Reports generates call sheets, the Day Out of Days, and breakdown exports styled like the documents a real production runs on.",
    route: "/reports",
    target: "page-header",
    tryLabel: "Open Reports",
    tryRoute: "/reports",
  },
  {
    id: "done",
    title: "That's the tour",
    body: "Explore freely — the Feature handbook has a page for every area, and the ? on any page opens its docs. Relaunch this tour any time from your user menu.",
    route: "/dashboard",
  },
];
