// ============================================================
// FEATURE HANDBOOK — structured in-app documentation.
//
// One entry per feature area. Kept as plain data (no JSX) so it's easy to
// maintain and so both the Help hub (src/pages/Tutorial.tsx) and the command
// palette can render/search it. `route` powers the "Go there" deep link;
// `iconKey` is resolved to a lucide icon by the Help hub.
// ============================================================

export interface HandbookDoc {
  id: string;
  title: string;
  /** One-line summary — shown in the TOC and command palette. */
  summary: string;
  /** Lucide icon name, resolved in the Help hub. */
  iconKey: string;
  /** Deep link to the live feature. Omit for concept pages. */
  route?: string;
  /** Extra search terms. */
  keywords?: string;
  /** Intro paragraphs — "what it's for". */
  body: string[];
  /** Numbered "how to use it" steps. */
  steps?: string[];
  /** Short tips / gotchas. */
  tips?: string[];
}

export const HANDBOOK: HandbookDoc[] = [
  {
    id: "projects",
    title: "Projects",
    summary: "Create productions; each holds one script and its full breakdown.",
    iconKey: "clapperboard",
    route: "/projects",
    keywords: "production create switch new project poster",
    body: [
      "A project is one production: its script, breakdown, schedule, budget and every department's data. You can keep several and switch between them from the project switcher in the top bar.",
      "The active project's data is what every other page shows. Switching projects swaps the whole workspace instantly.",
    ],
    steps: [
      "Click New project, name it, and pick a budget currency.",
      "Open the project, then upload a script to generate the breakdown.",
      "Use the project switcher (top-left) to jump between productions.",
      "In a hurry? Load sample production fills every feature with a demo film.",
    ],
    tips: [
      "Deleting a project removes its breakdown — export a backup first from Admin → Data.",
      "The active project shows a colored poster and an Active badge.",
    ],
  },
  {
    id: "breakdown-run",
    title: "Script upload & AI breakdown",
    summary: "Turn a PDF or pasted screenplay into a scene-by-scene breakdown.",
    iconKey: "sparkles",
    route: "/projects",
    keywords: "upload pdf paste screenplay ai run breakdown parse scenes theater",
    body: [
      "Upload a PDF (parsed privately in your browser) or paste the text. SceneTrackable splits the script on INT./EXT. headings, then analyzes every scene for cast, extras, props, wardrobe, SFX, VFX, vehicles, animals, locations and production requirements.",
      "During the run you'll see the live breakdown theater — each scene flips from queued to analyzing to done as elements are extracted, with running counts.",
    ],
    steps: [
      "On the Projects page, open a project and click Upload script.",
      "Drop a PDF or paste the screenplay, then Parse.",
      "Review the detected scenes and click Run breakdown.",
      "When it finishes, pick which characters and locations to add, then Continue.",
    ],
    tips: [
      "Scene headings must start with INT. or EXT. to be detected.",
      "Without an API key the app uses an intelligent demo breakdown so you can still explore.",
    ],
  },
  {
    id: "breakdown",
    title: "Scenes & the breakdown grid",
    summary: "Edit every scene's elements, filter by day/night, INT/EXT, cast and more.",
    iconKey: "film",
    route: "/breakdown",
    keywords: "scenes elements edit filter chips inspector props wardrobe",
    body: [
      "The Breakdown page is the editable heart of the production. Pick a scene on the left; edit its heading, notes and every element on the right. Elements are color-coded by category everywhere they appear.",
      "Filter chips narrow the scene list by INT/EXT, time of day, location, cast and shoot date.",
    ],
    steps: [
      "Select a scene from the list (or jump to one with ⌘K).",
      "Edit element name, sub-category, description and notes inline.",
      "Add an element with Add element, or re-analyze the scene with AI.",
      "Use the filter toolbar to focus on a subset of scenes.",
    ],
    tips: [
      "Press J / K to move to the next / previous scene.",
      "Export the whole breakdown to CSV or printable sheets from the header.",
    ],
  },
  {
    id: "locations",
    title: "Locations",
    summary: "Track every location: permits, lock dates, contacts, cost and photos.",
    iconKey: "map-pin",
    route: "/locations",
    keywords: "locations permit lock scout address contact map",
    body: [
      "Locations consolidates the places in your script into records you manage — permit status, lock date, parking and power notes, day rate and reference photos.",
      "Lock dates feed deadline rules (a task can be due two days before a location locks).",
    ],
    steps: [
      "Add a location or accept the ones the breakdown proposed.",
      "Set its permit status and lock date as it firms up.",
      "Attach contacts, a map link and scout photos.",
    ],
    tips: ["A locked location turns green across the schedule and reports."],
  },
  {
    id: "cast",
    title: "Cast",
    summary: "Manage the cast list, character mapping, rates and DOOD status.",
    iconKey: "users",
    route: "/cast",
    keywords: "cast actors characters roles agent rate dood",
    body: [
      "Cast holds each performer, the character they play, their category (lead / supporting / day player), day rate, agent and the scenes they appear in.",
      "The character bible from the AI run seeds this list; you confirm who's actually booked.",
    ],
    steps: [
      "Add a cast member and map them to a character.",
      "Set their category and day rate.",
      "Their scene list drives the Day Out of Days matrix.",
    ],
    tips: ["Identity avatars are generated from each person's id — consistent everywhere."],
  },
  {
    id: "art",
    title: "Art / Wardrobe / Props",
    summary: "Source and track physical elements from needed to ready.",
    iconKey: "palette",
    route: "/art",
    keywords: "art wardrobe props set dressing makeup continuity status",
    body: [
      "The Art portal tracks every physical element — props, wardrobe, set dressing and makeup — through a status pipeline (needed → sourced → in progress → fitting → ready), with cost and reference photos.",
    ],
    steps: [
      "Add an element or accept AI prop/wardrobe suggestions.",
      "Link it to the scenes and character it belongs to.",
      "Advance its status as it's sourced and prepped.",
    ],
    tips: ["Continuity-critical items (like a hero prop) deserve a backup — note it."],
  },
  {
    id: "camera",
    title: "Camera",
    summary: "Build camera kits and prep checklists from an equipment catalog.",
    iconKey: "camera",
    route: "/camera",
    keywords: "camera kit lens equipment checklist checkout prep",
    body: [
      "Camera manages kit builds (bodies, lenses, support), assigns them to shoot days, and runs prep checklists so nothing ships un-tested.",
    ],
    steps: [
      "Build a kit from catalog presets or free-text items.",
      "Assign the kit to a shoot day.",
      "Work a prep checklist and log equipment checkouts.",
    ],
  },
  {
    id: "drones",
    title: "Drones / Aerial",
    summary: "Register drones, operators, licenses and day assignments.",
    iconKey: "plane",
    route: "/drones",
    keywords: "drone aerial operator license registration waiver",
    body: [
      "Drones tracks each airframe, its operator and license, registration status, day rates, and which shoot day it flies.",
    ],
    steps: [
      "Add a drone from the catalog or manually.",
      "Record the operator, license and registration status.",
      "Assign it to the shoot day that needs the aerial.",
    ],
  },
  {
    id: "vfx",
    title: "VFX Pipeline",
    summary: "Manage shots, vendors, review rounds and delivery dates.",
    iconKey: "sparkles",
    route: "/vfx",
    keywords: "vfx shots vendor plate delivery review pipeline complexity",
    body: [
      "The VFX Pipeline tracks each shot from bid to delivered, its complexity, the assigned vendor, review rounds completed, and plate/final due dates.",
    ],
    steps: [
      "Add shots (scenes flagged for VFX in the breakdown are good candidates).",
      "Assign a vendor and set complexity.",
      "Advance status and tick off review rounds as they're delivered.",
    ],
  },
  {
    id: "rf",
    title: "RF / Comms",
    summary: "Coordinate frequencies and wireless equipment per location.",
    iconKey: "radio",
    route: "/rf",
    keywords: "rf comms frequency wireless mic ifb channel plan",
    body: [
      "RF / Comms builds a frequency plan per shoot day and location, and tracks wireless equipment (TX/RX, IFB) and its assignment.",
    ],
    steps: [
      "Add frequency-plan entries per device, day and location.",
      "Register wireless equipment and assign it to days.",
    ],
    tips: ["Congested bands need city coordination — note it on the plan entry."],
  },
  {
    id: "schedule",
    title: "Schedule",
    summary: "Build the shooting schedule; drag scenes across days.",
    iconKey: "calendar",
    route: "/schedule",
    keywords: "schedule strip board shoot days drag company move publish",
    body: [
      "The Schedule assigns scenes to shoot days. Drag scenes between days; a day can span multiple locations (a company move). Publishing a schedule notifies the team and recomputes deadlines.",
    ],
    steps: [
      "Create shoot days with dates, call/wrap times and locations.",
      "Drag scenes onto the day they'll shoot.",
      "Publish to lock the version and notify everyone.",
    ],
    tips: [
      "Dropping a scene shows a ghost preview and highlights the target day.",
      "A double-booked cast member raises a warning badge.",
    ],
  },
  {
    id: "dood",
    title: "Day Out of Days (DOOD)",
    summary: "The cast-by-day status matrix — work, hold, travel, start/finish.",
    iconKey: "grid",
    route: "/reports",
    keywords: "dood day out of days cast matrix work hold travel start finish",
    body: [
      "The DOOD matrix shows each cast member's status on every shoot day (Start, Work, Hold, Finish, Travel, Off). It's the backbone of cast scheduling and cost.",
    ],
    steps: [
      "Seed it from the schedule, then adjust per cell.",
      "Set a cell's status from its dropdown.",
      "Export the DOOD sheet from Reports.",
    ],
  },
  {
    id: "timesheet",
    title: "Timesheet",
    summary: "Log crew hours by day; submit and track edits.",
    iconKey: "clock",
    route: "/timesheet",
    keywords: "timesheet hours crew overtime submit week",
    body: [
      "Timesheet records hours per crew member per day. Crew log and submit their own; admins can override, and every edit is kept as an audit trail.",
    ],
    steps: [
      "Pick a week and add hours per day.",
      "Submit the week when it's complete.",
      "Admins can correct a submitted entry — the change is logged.",
    ],
  },
  {
    id: "tasks",
    title: "Tasks",
    summary: "Assign work with deadlines tied to shoot days and location locks.",
    iconKey: "list-checks",
    route: "/tasks",
    keywords: "tasks deadline owner priority blocked department",
    body: [
      "Tasks track production work with an owner, department, priority and a deadline. Deadlines can be a fixed date or a rule relative to a shoot day or location lock, so they move when the schedule does.",
    ],
    steps: [
      "Create a task, assign an owner and set a deadline.",
      "Link it to a scene or shoot day for context.",
      "Advance its status; mark blockers so dependencies are visible.",
    ],
    tips: ["Overdue and blocked tasks surface in notifications and on the dashboard."],
  },
  {
    id: "budget",
    title: "Budget",
    summary: "Track budgeted vs committed vs spent, POs and petty cash.",
    iconKey: "dollar-sign",
    route: "/budget",
    keywords: "budget purchase order po petty cash approval account code",
    body: [
      "Budget holds your account lines (budgeted / committed / spent), the purchase-order approval flow, and petty-cash logging.",
      "POs route through accountant then admin approval, with a full audit log.",
    ],
    steps: [
      "Set up budget lines by account code and department.",
      "Submit a PO against a line; it routes for approval.",
      "Log petty cash against a department as it's spent.",
    ],
  },
  {
    id: "reports",
    title: "Reports & exports",
    summary: "Generate call sheets, DOOD, breakdown CSV and printable sheets.",
    iconKey: "file-bar-chart",
    route: "/reports",
    keywords: "reports export csv pdf call sheet dood print paperwork",
    body: [
      "Reports produces industry-standard paperwork — call sheets, the DOOD, and breakdown exports (CSV or printable sheets styled like real production documents). Printing forces a light theme so it reads on paper.",
    ],
    steps: [
      "Choose a report and review its preview.",
      "Download the CSV or print the styled sheet.",
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    summary: "Schedule changes, approvals, overdue tasks and the daily digest.",
    iconKey: "bell",
    route: "/notifications",
    keywords: "notifications alerts digest approvals bell unread",
    body: [
      "The bell in the top bar collects everything that needs attention — schedule changes, PO approvals, overdue tasks and the AI daily digest. New arrivals pop the badge.",
    ],
    steps: [
      "Open the bell to skim recent items.",
      "Click one to jump to the thing it's about.",
      "Mark all read to clear the count.",
    ],
  },
  {
    id: "roles",
    title: "Roles & permissions",
    summary: "Per-page read/write control by role, managed in Admin.",
    iconKey: "shield",
    route: "/admin",
    keywords: "roles permissions access read write admin department",
    body: [
      "Every role has a per-page permission level: none (hidden), read (view only) or write (edit). Presets like 1st AD, Accountant or VFX Supervisor are starting points you can fine-tune.",
      "A read-only page shows a banner and drops its edit controls.",
    ],
    steps: [
      "In Admin → Users & Roles, add or edit a role.",
      "Set each page to none / read / write.",
      "Assign the role to a user.",
    ],
    tips: ["You can't demote the last admin role that still has an active user."],
  },
  {
    id: "cloud",
    title: "Cloud sync & team presence",
    summary: "Automatic shared-workspace sync with live presence.",
    iconKey: "cloud",
    route: "/admin",
    keywords: "cloud sync supabase presence realtime conflict offline shared",
    body: [
      "When cloud sync is configured, the whole team shares one workspace. Changes push automatically and peers pull within seconds; online teammates appear as presence avatars in the top bar.",
      "The cloud indicator shows synced / syncing / pending / offline / conflict. If two people edit at once, you're asked which version wins — nothing is overwritten silently.",
    ],
    steps: [
      "Watch the cloud indicator in the top bar for status.",
      "Resolve a conflict by choosing your version or theirs.",
      "Manage connection details in Admin → Cloud.",
    ],
  },
  {
    id: "admin",
    title: "Admin console",
    summary: "Users & roles, AI, cloud and data backup in one place.",
    iconKey: "shield",
    route: "/admin",
    keywords: "admin users roles ai cloud data backup restore activity log",
    body: [
      "The Admin console consolidates everything an administrator manages: Users & Roles, AI settings and usage, Cloud sync, and Data (backup / restore and the activity log).",
    ],
    steps: [
      "Users & Roles — add teammates, issue invite codes, tune permissions.",
      "AI — usage budget and alerts.",
      "Cloud — connection status and conflict tools.",
      "Data — download a backup, restore one, or open the activity log.",
    ],
  },
  {
    id: "settings",
    title: "Settings",
    summary: "Your personal appearance, density and accent preferences.",
    iconKey: "settings",
    route: "/settings",
    keywords: "settings appearance theme dark light system density accent personal",
    body: [
      "Settings are per-user and separate from Admin. Choose a light / dark / system theme, adjust density, and pick an accent color. Changes apply immediately and only to you.",
    ],
    steps: [
      "Open Settings from the user menu.",
      "Pick a theme from the preview cards.",
      "Adjust density and accent to taste.",
    ],
  },
];

export const getHandbookDoc = (id: string): HandbookDoc | undefined =>
  HANDBOOK.find((d) => d.id === id);
