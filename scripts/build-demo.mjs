// ============================================================
// Demo showcase generator.
//
// Emits scenetrackable-demo-showcase.json at the project root, in
// SceneTrackable's persisted-store shape ({ state, version }) — loadable
// through the same restore path as an Admin backup (Admin → Data → Restore,
// or the "Load sample" flow). It is a SECOND, fully independent production
// ("Salt & Static", an original modern thriller short) so it reads as fresh
// dummy data rather than a copy of the bundled sample — and it is dressed to
// exercise EVERY collection the app renders: multi-location shoot days, DOOD,
// budget + PO approval chains + petty cash, VFX pipeline + vendors, RF/comms,
// camera kits + drones, art/wardrobe, timesheets, checklists, notifications,
// activity log, AI usage + digest, and a full user/role set for presence.
//
//   node scripts/build-demo.mjs
// ============================================================

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "scenetrackable-demo-showcase.json");

// Deterministic ISO helpers, anchored so the production reads as "in prep".
const DAY = 86400000;
const now = new Date("2026-07-19T09:00:00.000Z");
const iso = (offsetDays, h = 9) =>
  new Date(now.getTime() + offsetDays * DAY + (h - 9) * 3600000).toISOString();
const dateOnly = (offsetDays) => iso(offsetDays).slice(0, 10);

// ------------------------------------------------------------
// SCENES — an original modern short: "Salt & Static"
// A blackout hits a coastal town; a radio engineer and a fisher's daughter
// keep one transmitter alive through the night. Modern setting → lets the
// data lean into drones, VFX, vehicles, night EXT and comms.
// ------------------------------------------------------------
const el = (name, category, subCategory, description, notes) => ({
  id: `el_${category}_${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40),
  name,
  category,
  ...(subCategory ? { subCategory } : {}),
  ...(description ? { description } : {}),
  ...(notes ? { notes } : {}),
});

const SCENES = [
  {
    number: "1", intExt: "EXT", location: "Harbor Breakwater", timeOfDay: "DUSK", pages: 1.25,
    synopsis: "MARA hauls the last crates as the harbor lights flicker and die — the whole coast goes dark.",
    scriptText:
      "EXT. HARBOR BREAKWATER - DUSK\n\nMARA CHEN, 24, weather-beaten, drags crates up the slick concrete. The string of harbor lights STUTTERS — then the entire coastline blacks out at once.\n\nMARA\nThat's not a fuse.",
    elements: [
      el("Mara Chen", "cast", "Lead", "On camera the whole scene"),
      el("Fish crates", "props", "Set dressing", "Wet, weathered"),
      el("Harbor light string", "sfx", "Practical", "Programmed flicker → blackout"),
      el("Coastline blackout", "vfx", "Environment", "Kill city glow on the far shore"),
      el("Mara's oilskin jacket", "wardrobe", "Contemporary", "Salt-stained yellow"),
      el("Fishing trawler", "vehicles", "Picture", "Moored, background"),
    ],
  },
  {
    number: "2", intExt: "INT", location: "Coastal Radio Station", timeOfDay: "NIGHT", pages: 2.0,
    synopsis: "ELI fights the failing transmitter by torchlight; the backup generator coughs and holds.",
    scriptText:
      "INT. COASTAL RADIO STATION - NIGHT\n\nELI OKORO, 39, sweeps a torch over a wall of dead meters. He slaps the generator. It COUGHS, catches, and one green light holds.\n\nELI\nCome on. Stay with me.",
    elements: [
      el("Eli Okoro", "cast", "Lead", "First appearance"),
      el("Transmitter rack", "props", "Hero", "Period-agnostic broadcast gear"),
      el("Backup generator", "props", "Hero", "SFX: cough + catch"),
      el("Torch beam haze", "sfx", "Lighting", "Atmos smoke + practical torch"),
      el("Meter glow-up", "vfx", "Invisible", "Bring dead meters to life on cue"),
      el("Eli's headset", "props", "Hand prop"),
    ],
  },
  {
    number: "3", intExt: "EXT", location: "Cliff Road", timeOfDay: "NIGHT", pages: 1.5,
    synopsis: "Mara races the coast road on a motorbike toward the transmitter tower, headlight carving the dark.",
    scriptText:
      "EXT. CLIFF ROAD - NIGHT\n\nA single headlight carves the black. MARA leans her bike hard through the switchbacks, the dead town falling away below.",
    elements: [
      el("Mara Chen", "cast", "Lead"),
      el("Motorbike", "vehicles", "Picture", "Hero — stunt double for leans"),
      el("Bike headlight", "sfx", "Lighting", "Practical + tracking beam"),
      el("Stunt rider double", "stunts", "Featured", "Cornering at speed"),
      el("Aerial chase plate", "vfx", "Drone plate", "Stabilize + speed ramp"),
      el("Cliff edge crowd control", "extras", "Background", "None — closed road"),
    ],
  },
  {
    number: "4", intExt: "INT", location: "Coastal Radio Station", timeOfDay: "NIGHT", pages: 2.5,
    synopsis: "Mara and Eli argue, then rig her boat battery to the transmitter — the signal claws back to life.",
    scriptText:
      "INT. COASTAL RADIO STATION - NIGHT\n\nMARA drops a marine battery on the desk. Sparks. ELI stares.\n\nELI\nThat'll fry the whole board.\n\nMARA\nOr it'll talk. Pick one.",
    elements: [
      el("Mara Chen", "cast", "Lead"),
      el("Eli Okoro", "cast", "Lead"),
      el("Marine battery", "props", "Hero", "Jump-rig to the rack"),
      el("Spark burst", "sfx", "Pyro", "Small practical spark — licensed"),
      el("Signal-alive glow", "vfx", "Invisible", "Board lights ripple on"),
      el("Jumper cables", "props", "Hand prop"),
    ],
  },
  {
    number: "5", intExt: "EXT", location: "Transmitter Tower Base", timeOfDay: "NIGHT", pages: 1.0,
    synopsis: "They climb to reset the dish; wind and height. A drone lifts to reveal the dark coast for miles.",
    scriptText:
      "EXT. TRANSMITTER TOWER BASE - NIGHT\n\nWind screams. ELI and MARA start up the gantry ladder. We rise with them — then keep rising, up past the dish, to reveal a coastline swallowed whole by the dark.",
    elements: [
      el("Mara Chen", "cast", "Lead"),
      el("Eli Okoro", "cast", "Lead"),
      el("Tower gantry", "props", "Set dressing", "Safety-rigged practical"),
      el("Height safety rig", "stunts", "Rigging", "Fall arrest — both actors"),
      el("Wind machine", "sfx", "Atmos", "Ritter fan + debris"),
      el("Aerial reveal", "vfx", "Drone plate", "Vertical pull-up, sky + coast extension"),
      el("Dark coast extension", "vfx", "Environment", "Matte the blacked-out shoreline"),
    ],
  },
  {
    number: "5A", intExt: "EXT", location: "Coast — Aerial", timeOfDay: "NIGHT", pages: 0.5,
    synopsis: "INSERT — the drone holds high; one window, then a dozen, then a hundred flicker back on across the coast.",
    scriptText:
      "EXT. COAST - NIGHT (AERIAL INSERT)\n\nFrom high above: one window glows. Then a dozen. Then a whole coastline of them, blooming back to life as the signal reaches home.",
    elements: [
      el("Lights-return bloom", "vfx", "Environment", "CG windows bloom on across matte coast"),
      el("Aerial hold", "vfx", "Drone plate", "Locked high-altitude plate"),
      el("Star field", "vfx", "Environment", "Clean sky replace"),
    ],
  },
  {
    number: "6", intExt: "INT", location: "Coastal Radio Station", timeOfDay: "DAWN", pages: 1.25,
    synopsis: "Dawn. The town is lit. Mara and Eli, wrecked and grinning, sign off the night broadcast.",
    scriptText:
      "INT. COASTAL RADIO STATION - DAWN\n\nGrey light. Both of them slumped, filthy, alive. ELI leans to the mic.\n\nELI\nThat's the night shift. Get some sleep, coast. We've got you.",
    elements: [
      el("Mara Chen", "cast", "Lead"),
      el("Eli Okoro", "cast", "Lead"),
      el("Broadcast mic", "props", "Hero"),
      el("Dawn window light", "sfx", "Lighting", "Warm sunrise wash"),
      el("Coffee flasks", "props", "Set dressing"),
    ],
  },
];

// number -> scene id (stable)
const sceneId = (n) => `sc_${n}`;
const scenes = SCENES.map((s) => ({
  id: sceneId(s.number),
  number: s.number,
  intExt: s.intExt,
  location: s.location,
  timeOfDay: s.timeOfDay,
  synopsis: s.synopsis,
  scriptText: s.scriptText,
  pages: s.pages,
  estimatedShootMinutes: Math.round(s.pages * 55),
  elements: s.elements,
  vfxFlags: s.elements.some((e) => e.category === "vfx"),
  sfxFlags: s.elements.some((e) => e.category === "sfx"),
  ...(s.notes ? { notes: s.notes } : {}),
}));

const elementCount = scenes.reduce((n, s) => n + s.elements.length, 0);
const totalPages = scenes.reduce((n, s) => n + s.pages, 0);

const scenesFor = (charName) =>
  scenes.filter((s) => s.elements.some((e) => e.category === "cast" && e.name === charName)).map((s) => s.id);

// ------------------------------------------------------------
// CHARACTER BIBLE
// ------------------------------------------------------------
const characterBible = [
  { name: "Mara Chen", speaking: true, importance: "lead", description: "Fisher's daughter. Fearless, blunt, keeps the boat and the town alive.", firstSceneNumber: "1" },
  { name: "Eli Okoro", speaking: true, importance: "lead", description: "The last radio engineer. Stubborn, tender, married to the transmitter.", firstSceneNumber: "2" },
];

// ------------------------------------------------------------
// CAST
// ------------------------------------------------------------
const cast = [
  { id: "cast_mara", name: "Nadia Sarr", role: "Mara Chen", category: "lead", scenes: scenesFor("Mara Chen"), ratePerDay: 3400, agent: "Harbor Talent", contact: "nadia@example.com", gender: "F" },
  { id: "cast_eli", name: "Dominic Farrow", role: "Eli Okoro", category: "lead", scenes: scenesFor("Eli Okoro"), ratePerDay: 3600, agent: "Harbor Talent", contact: "dominic@example.com", gender: "M" },
  { id: "cast_double", name: "Kai Brenner", role: "Mara — stunt double", category: "day_player", scenes: [sceneId("3")], ratePerDay: 1200, gender: "M" },
];

// ------------------------------------------------------------
// CREW
// ------------------------------------------------------------
const crew = [
  { id: "crew_dp", name: "Ines Marlow", role: "Director of Photography", department: "camera", email: "ines@saltstatic.example", ratePerHour: 98, otRateMultiplier: 1.5 },
  { id: "crew_gaffer", name: "Theo Vance", role: "Gaffer", department: "camera", email: "theo@saltstatic.example", ratePerHour: 64, otRateMultiplier: 1.5 },
  { id: "crew_1ad", name: "Salma Reyes", role: "1st Assistant Director", department: "production", email: "salma@saltstatic.example", ratePerHour: 82 },
  { id: "crew_art", name: "Bram Holt", role: "Production Designer", department: "art", email: "bram@saltstatic.example", ratePerHour: 72 },
  { id: "crew_ward", name: "June Park", role: "Costume Designer", department: "wardrobe", email: "june@saltstatic.example", ratePerHour: 58 },
  { id: "crew_sound", name: "Otis Kane", role: "Production Sound Mixer", department: "sound", email: "otis@saltstatic.example", ratePerHour: 66 },
  { id: "crew_vfx", name: "Wren Alvarez", role: "VFX Supervisor", department: "vfx", email: "wren@saltstatic.example", ratePerHour: 90 },
  { id: "crew_stunt", name: "Marcus Reed", role: "Stunt Coordinator", department: "stunts", email: "marcus@saltstatic.example", ratePerHour: 84 },
  { id: "crew_acct", name: "Dahlia Fenn", role: "Production Accountant", department: "accounting", email: "dahlia@saltstatic.example", ratePerHour: 62 },
];

// ------------------------------------------------------------
// LOCATIONS
// ------------------------------------------------------------
const locations = [
  { id: "loc_harbor", name: "Harbor Breakwater", type: "EXT", address: "North Mole, Port Kessel", contactName: "Harbor Authority", contactPhone: "+1 555 0200", permitStatus: "locked", lockDate: dateOnly(5), parkingNotes: "Unit base on the quay", powerNotes: "Genny only — no tie-in on the mole", costPerDay: 2200, notes: "Tide table pinned to call sheet. Night work." },
  { id: "loc_station", name: "Coastal Radio Station", type: "INT", address: "Stage 2, Kessel Studios", contactName: "Studio Ops", contactPhone: "+1 555 0210", permitStatus: "locked", lockDate: dateOnly(5), parkingNotes: "Studio lot A", powerNotes: "House power + 60kW genny backup", costPerDay: 1900, notes: "Standing set — practical transmitter wall." },
  { id: "loc_cliff", name: "Cliff Road", type: "EXT", address: "Old Coast Highway, mile 7", contactName: "County Film Office", contactPhone: "+1 555 0230", permitStatus: "permit_pending", parkingNotes: "Rolling closure — traffic mgmt hired", powerNotes: "Mobile genny truck", costPerDay: 2600, notes: "Stunt road closure 20:00–04:00." },
  { id: "loc_tower", name: "Transmitter Tower Base", type: "EXT", address: "Kessel Head ridge", contactName: "County Film Office", permitStatus: "optioned", parkingNotes: "4x4 shuttle from mile 7", powerNotes: "Genny + tower service power", costPerDay: 1500, notes: "Height rigging — stunt sign-off required." },
];

// ------------------------------------------------------------
// SCHEDULE — 4 shoot days, days with multiple locations (company moves)
// ------------------------------------------------------------
const shootDays = [
  {
    id: "day_1", dayNumber: 1, date: dateOnly(5), location: "Coastal Radio Station",
    locations: ["Coastal Radio Station"],
    estimatedHours: 11, callTime: "08:00", wrapTime: "19:00", weather: "Interior — controlled",
    scenes: [sceneId("2"), sceneId("4"), sceneId("6")],
    banners: [{ type: "meal", label: "Lunch 13:00 (34 crew)" }],
  },
  {
    id: "day_2", dayNumber: 2, date: dateOnly(6), location: "Harbor Breakwater",
    locations: ["Harbor Breakwater"],
    estimatedHours: 10, callTime: "15:00", wrapTime: "01:00", weather: "Clear, 9°C, high tide 21:40",
    scenes: [sceneId("1")],
    banners: [{ type: "meal", label: "Second meal 21:00" }, { type: "note", label: "Tide-critical — sc.1 before 22:00" }],
  },
  {
    id: "day_3", dayNumber: 3, date: dateOnly(7), location: "Cliff Road",
    locations: ["Cliff Road", "Transmitter Tower Base"],
    estimatedHours: 12, callTime: "16:00", wrapTime: "04:00", weather: "Night — clear, wind 25km/h",
    scenes: [sceneId("3"), sceneId("5")],
    banners: [{ type: "company_move", label: "Company move → Tower Base 22:30" }, { type: "meal", label: "Second meal 22:00" }],
  },
  {
    id: "day_4", dayNumber: 4, date: dateOnly(8), location: "Transmitter Tower Base",
    locations: ["Transmitter Tower Base", "Coast — Aerial"],
    estimatedHours: 8, callTime: "18:00", wrapTime: "02:00", weather: "Night — clear",
    scenes: [sceneId("5A")],
    banners: [{ type: "company_move", label: "Split unit: aerial team on the ridge" }],
  },
];

// ------------------------------------------------------------
// DOOD — cast x day
// ------------------------------------------------------------
const dood = {
  cast_mara: { 1: "SW", 2: "W", 3: "W", 4: "WF" },
  cast_eli: { 1: "SW", 2: "OFF", 3: "W", 4: "WF" },
  cast_double: { 1: "OFF", 2: "OFF", 3: "SWF", 4: "OFF" },
};

// ------------------------------------------------------------
// TASKS
// ------------------------------------------------------------
const task = (id, title, owner, department, deadlineOffset, status, priority, extra = {}) => ({
  id, title, owner, department,
  deadlineRule: `manual(${dateOnly(deadlineOffset)})`,
  computedDeadline: iso(deadlineOffset, 18),
  status, priority,
  createdAt: iso(-6), updatedAt: iso(-1),
  ...extra,
});
const tasks = [
  task("task_battery", "Rig safe marine-battery jump gag (sc.4)", "crew_art", "props", 3, "in_progress", "high", { linkedScene: sceneId("4"), description: "Practical spark, licensed pyro sign-off. Backup rig." }),
  task("task_bike", "Motorbike prep + stunt rehearsal (cliff road)", "crew_stunt", "stunts", 4, "review", "critical", { linkedScene: sceneId("3"), description: "Cornering passes with double; camera-bike tracking." }),
  task("task_droneplan", "Drone flight plan + night waiver — aerial reveal", "crew_dp", "camera", 2, "in_progress", "high", { linkedScene: sceneId("5A"), linkedShootDay: 4 }),
  task("task_towersafe", "Tower height-rig safety sign-off", "crew_stunt", "stunts", 6, "blocked", "critical", { blockedBy: ["task_permit"], linkedScene: sceneId("5"), description: "Blocked on tower-base permit." }),
  task("task_permit", "Pull EXT night permit — Cliff Road + Tower", "crew_1ad", "production", 3, "blocked", "critical", { blockedBy: ["task_traffic"], description: "Waiting on traffic-management confirmation." }),
  task("task_traffic", "Confirm traffic management — road closure", "crew_1ad", "production", 1, "completed", "medium", {}),
  task("task_windfx", "Wind machine + debris package — tower", "crew_gaffer", "camera", 5, "not_started", "medium", { linkedScene: sceneId("5") }),
  task("task_tide", "Tide-window plan for harbor night (sc.1)", "crew_1ad", "production", 4, "in_progress", "high", { linkedShootDay: 2, linkedScene: sceneId("1") }),
  task("task_genny", "Book 60kW genny + fuel for station backup", "crew_gaffer", "camera", 4, "not_started", "medium", { linkedShootDay: 1 }),
  task("task_call1", "Distribute Day 1 call sheet", "crew_1ad", "production", 4, "not_started", "low", { linkedShootDay: 1 }),
];

// ------------------------------------------------------------
// BUDGET
// ------------------------------------------------------------
const budgetLines = [
  { id: "bl_atl_1", code: "1100", category: "Above the Line", subcategory: "Cast", department: "cast", description: "Principal cast + stunt double", budgeted: 46000, committed: 41000, spent: 15200 },
  { id: "bl_atl_2", code: "1200", category: "Above the Line", subcategory: "Director/Producer", department: "production", description: "Director & producer fees", budgeted: 60000, committed: 60000, spent: 30000 },
  { id: "bl_cam", code: "2100", category: "Production", subcategory: "Camera", department: "camera", description: "Camera + grip/electric + genny", budgeted: 54000, committed: 46000, spent: 11800 },
  { id: "bl_stunt", code: "2150", category: "Production", subcategory: "Stunts", department: "stunts", description: "Stunt coordination, rigging, bike", budgeted: 28000, committed: 19000, spent: 6400 },
  { id: "bl_art", code: "2200", category: "Production", subcategory: "Art/Set", department: "art", description: "Set dressing, transmitter build, props", budgeted: 33000, committed: 24500, spent: 12900 },
  { id: "bl_ward", code: "2300", category: "Production", subcategory: "Wardrobe", department: "wardrobe", description: "Contemporary costume + repeats", budgeted: 15000, committed: 9800, spent: 4100 },
  { id: "bl_loc", code: "2400", category: "Production", subcategory: "Locations", department: "production", description: "Location fees, permits, traffic mgmt", budgeted: 26000, committed: 14200, spent: 5300 },
  { id: "bl_vfx", code: "3100", category: "Post", subcategory: "VFX", department: "vfx", description: "Blackout, aerial extension, lights-return", budgeted: 42000, committed: 22000, spent: 0 },
  { id: "bl_sound", code: "3200", category: "Post", subcategory: "Sound", department: "sound", description: "Production sound + mix", budgeted: 18000, committed: 10000, spent: 3600 },
];
const budgetTotal = budgetLines.reduce((n, b) => n + b.budgeted, 0);

const purchaseOrders = [
  {
    id: "po_1", number: "PO-0001", vendor: "Kessel Grip & Electric", description: "60kW genny + distro, 4 days",
    amount: 6800, currency: "AED", accountCode: "2100", department: "camera", linkedShootDay: 1,
    requestedBy: "crew_gaffer", requestedAt: iso(-4), status: "approved",
    approvals: [
      { step: "accountant", by: "crew_acct", at: iso(-3), decision: "approved", note: "Within camera line." },
      { step: "admin", by: "user_admin", at: iso(-3, 14), decision: "approved" },
    ],
    auditLog: [{ at: iso(-4), by: "crew_gaffer", action: "submitted" }, { at: iso(-3), by: "crew_acct", action: "accountant_approved" }, { at: iso(-3, 14), by: "user_admin", action: "admin_approved" }],
  },
  {
    id: "po_2", number: "PO-0002", vendor: "SkyLine Aerial Unit", description: "Drone day + operator — aerial reveal (sc.5/5A)",
    amount: 7400, currency: "AED", accountCode: "2100", department: "camera", linkedShootDay: 4,
    requestedBy: "crew_dp", requestedAt: iso(-1), status: "accountant_review",
    approvals: [], auditLog: [{ at: iso(-1), by: "crew_dp", action: "submitted" }],
  },
  {
    id: "po_3", number: "PO-0003", vendor: "Precision Stunt Rigging", description: "Tower fall-arrest rig + riggers, 1 night",
    amount: 5200, currency: "AED", accountCode: "2150", department: "stunts", linkedShootDay: 3,
    requestedBy: "crew_stunt", requestedAt: iso(0), status: "submitted",
    approvals: [], auditLog: [{ at: iso(0), by: "crew_stunt", action: "submitted" }],
  },
  {
    id: "po_4", number: "PO-0004", vendor: "TideWater Marine", description: "Picture trawler + marine safety boat",
    amount: 3900, currency: "AED", accountCode: "2400", department: "production", linkedShootDay: 2,
    requestedBy: "crew_1ad", requestedAt: iso(-2), status: "rejected",
    approvals: [{ step: "accountant", by: "crew_acct", at: iso(-1), decision: "rejected", note: "Re-bid — safety boat quoted separately." }],
    auditLog: [{ at: iso(-2), by: "crew_1ad", action: "submitted" }, { at: iso(-1), by: "crew_acct", action: "accountant_rejected" }],
  },
];

const pettyCash = [
  { id: "pc_1", date: iso(-3), amount: 210, currency: "AED", description: "Marine battery + jumper cables (props)", department: "art", loggedBy: "crew_art" },
  { id: "pc_2", date: iso(-2), amount: 120, currency: "AED", description: "Hi-vis + gloves — night crew", department: "production", loggedBy: "crew_1ad" },
  { id: "pc_3", date: iso(-1), amount: 85, currency: "AED", description: "Coffee & flasks — cliff road recce", department: "camera", loggedBy: "crew_gaffer" },
];

// ------------------------------------------------------------
// VFX
// ------------------------------------------------------------
const vfxVendors = [
  { id: "vend_lumen", name: "Lumen Post", contact: "ops@lumen.example", city: "Toronto", assignedShots: ["vfx_blackout", "vfx_aerial", "vfx_bloom"], onTimePercent: 90 },
  { id: "vend_inhouse", name: "In-house Unit", contact: "wren@saltstatic.example", city: "Local", assignedShots: ["vfx_meters", "vfx_signal"], onTimePercent: 100 },
];
const vfxShots = [
  { id: "vfx_blackout", shotNumber: "001_010", sceneId: sceneId("1"), description: "Coastline blackout — kill far-shore city glow", complexity: "moderate", status: "awarded", vendorId: "vend_lumen", reviewRounds: 2, reviewsCompleted: 1, plateDeliveryDate: dateOnly(10), finalDueDate: dateOnly(28) },
  { id: "vfx_meters", shotNumber: "002_020", sceneId: sceneId("2"), description: "Dead meters glow up on cue", complexity: "simple", status: "in_progress", vendorId: "vend_inhouse", reviewRounds: 2, reviewsCompleted: 1, plateDeliveryDate: dateOnly(9), finalDueDate: dateOnly(20) },
  { id: "vfx_signal", shotNumber: "004_030", sceneId: sceneId("4"), description: "Signal-alive ripple across the board", complexity: "simple", status: "in_progress", vendorId: "vend_inhouse", reviewRounds: 2, reviewsCompleted: 0, finalDueDate: dateOnly(22) },
  { id: "vfx_aerial", shotNumber: "005_040", sceneId: sceneId("5"), description: "Vertical pull-up: sky replace + dark-coast extension", complexity: "complex", status: "bid", vendorId: "vend_lumen", reviewRounds: 3, reviewsCompleted: 0, plateDeliveryDate: dateOnly(12), finalDueDate: dateOnly(36) },
  { id: "vfx_bloom", shotNumber: "005A_050", sceneId: sceneId("5A"), description: "Lights-return bloom across matte coastline", complexity: "complex", status: "bid", vendorId: "vend_lumen", reviewRounds: 3, reviewsCompleted: 0, finalDueDate: dateOnly(38) },
];

// ------------------------------------------------------------
// RF / COMMS
// ------------------------------------------------------------
const frequencyPlan = [
  { id: "fp_1", shootDay: 1, location: "Coastal Radio Station", device: "Lav TX — Mara", frequencyMHz: 519.75, powerMW: 50, channel: "A1" },
  { id: "fp_2", shootDay: 1, location: "Coastal Radio Station", device: "Lav TX — Eli", frequencyMHz: 522.25, powerMW: 50, channel: "A2" },
  { id: "fp_3", shootDay: 3, location: "Cliff Road", device: "Boom hop TX", frequencyMHz: 536.5, powerMW: 100, channel: "B1", notes: "Coordinate with county repeater — check scan on arrival." },
  { id: "fp_4", shootDay: 3, location: "Cliff Road", device: "Comms — stunt channel", frequencyMHz: 464.5, powerMW: 500, channel: "C1", notes: "Dedicated stunt safety channel." },
  { id: "fp_5", shootDay: 4, location: "Transmitter Tower Base", device: "IFB — director", frequencyMHz: 217.25, powerMW: 25, channel: "IFB" },
];
const rfEquipment = [
  { id: "rf_1", type: "Wireless TX", model: "Wisycom MTP61", serial: "WX-2201", status: "assigned", assignedShootDay: 1, manufacturer: "Wisycom" },
  { id: "rf_2", type: "Wireless RX", model: "Wisycom MCR54", serial: "WX-4410", status: "assigned", assignedShootDay: 1, manufacturer: "Wisycom" },
  { id: "rf_3", type: "Comms base", model: "Motorola SLR5500", serial: "MO-7781", status: "assigned", assignedShootDay: 3, manufacturer: "Motorola" },
  { id: "rf_4", type: "IFB", model: "Lectrosonics IFBT4", serial: "LE-0155", status: "available", manufacturer: "Lectrosonics" },
];

// ------------------------------------------------------------
// CAMERA / DRONES
// ------------------------------------------------------------
const cameraKits = [
  { id: "kit_a", name: "A-Cam — ALEXA 35 + Signature Primes", items: ["ALEXA 35 body", "Signature Primes 25/35/50/75", "Cinesaddle + head", "2× 1TB drives"], assignedShootDay: 1, manufacturer: "ARRI" },
  { id: "kit_b", name: "B-Cam — ALEXA Mini LF + Ultra wides", items: ["ALEXA Mini LF", "Ultra wide 12/15", "Easyrig", "Steadicam vest"], assignedShootDay: 3, manufacturer: "ARRI" },
  { id: "kit_c", name: "Bike-cam — Ronin + long lens", items: ["DJI Ronin 2", "70–200 zoom", "Chase vehicle mount"], assignedShootDay: 3, manufacturer: "DJI" },
];
const drones = [
  { id: "drone_1", model: "Inspire 3", manufacturer: "DJI", serial: "DJI-INS3-771", weightGrams: 3995, regStatus: "registered", operatorName: "Priya Nair", operatorLicense: "UAS-44120", operatorRatePerDay: 2400, droneRatePerDay: 1600, assignedShootDay: 4, status: "assigned", notes: "Aerial reveal sc.5/5A. Night waiver filed with county." },
  { id: "drone_2", model: "Mavic 3 Cine", manufacturer: "DJI", serial: "DJI-M3C-902", weightGrams: 958, regStatus: "registered", operatorName: "Priya Nair", operatorLicense: "UAS-44120", operatorRatePerDay: 900, droneRatePerDay: 600, assignedShootDay: 3, status: "assigned", notes: "Bike chase B-plate, cliff road." },
];

const equipmentCheckouts = [
  { id: "co_1", item: "ALEXA 35 body (A-Cam)", checkedOutBy: "crew_dp", checkoutAt: iso(-1), condition: "Prep — clean" },
  { id: "co_2", item: "DJI Ronin 2 (Bike-cam)", checkedOutBy: "crew_dp", checkoutAt: iso(-1), condition: "Balanced + tested" },
];
const checklists = [
  { id: "cl_1", title: "Camera prep — Day 1", shootDay: 1, items: [
    { id: "cli_1", label: "Sensor clean + back-focus", done: true, doneAt: iso(-1), doneBy: "crew_dp" },
    { id: "cli_2", label: "Build A-cam + follow focus", done: true, doneAt: iso(-1), doneBy: "crew_gaffer" },
    { id: "cli_3", label: "Media format + speed test", done: false },
    { id: "cli_4", label: "Batteries cycled", done: false },
  ] },
  { id: "cl_2", title: "Stunt safety — Cliff Road", shootDay: 3, items: [
    { id: "cli_5", label: "Road closure confirmed", done: true, doneAt: iso(-1), doneBy: "crew_1ad" },
    { id: "cli_6", label: "Bike rehearsal at speed", done: false },
    { id: "cli_7", label: "Medic + safety boat on standby", done: false },
  ] },
];

// ------------------------------------------------------------
// ART / WARDROBE elements
// ------------------------------------------------------------
const artElements = [
  { id: "art_transmitter", name: "Practical transmitter wall", category: "prop", sceneIds: [sceneId("2"), sceneId("4"), sceneId("6")], status: "in_progress", cost: 4200, notes: "Working meters + programmable glow-up." },
  { id: "art_battery", name: "Marine battery jump rig", category: "prop", sceneIds: [sceneId("4")], status: "in_progress", cost: 650, notes: "Practical spark — pyro sign-off." },
  { id: "art_mic", name: "Broadcast mic (hero)", category: "prop", sceneIds: [sceneId("6")], status: "sourced", cost: 480 },
  { id: "art_oilskin", name: "Mara's oilskin jacket", category: "wardrobe", sceneIds: [sceneId("1")], characterName: "Mara Chen", status: "ready", cost: 320, notes: "3× repeats for water work." },
  { id: "art_helmet", name: "Mara's bike helmet + leathers", category: "wardrobe", sceneIds: [sceneId("3")], characterName: "Mara Chen", status: "fitting", cost: 900, notes: "Matched set for stunt double." },
  { id: "art_bike", name: "Picture motorbike", category: "prop", sceneIds: [sceneId("3")], status: "sourced", cost: 2100, notes: "Plus mechanical backup." },
  { id: "art_torch", name: "Eli's torch + rigging", category: "prop", sceneIds: [sceneId("2")], characterName: "Eli Okoro", status: "ready", cost: 140 },
];

// ------------------------------------------------------------
// TIMESHEET — prep days already logged
// ------------------------------------------------------------
const timesheet = [
  { id: "ts_1", crewMemberId: "crew_dp", date: dateOnly(-1), hours: 10, submitted: true, submittedAt: iso(-1, 19), edits: [] },
  { id: "ts_2", crewMemberId: "crew_gaffer", date: dateOnly(-1), hours: 11, submitted: true, submittedAt: iso(-1, 20), edits: [{ at: iso(-1, 21), by: "user_admin", fromHours: 10.5, toHours: 11, isAdminOverride: true }] },
  { id: "ts_3", crewMemberId: "crew_stunt", date: dateOnly(-1), hours: 8.5, submitted: true, submittedAt: iso(-1, 18), edits: [] },
  { id: "ts_4", crewMemberId: "crew_art", date: dateOnly(-1), hours: 9.5, submitted: true, submittedAt: iso(-1, 19), edits: [] },
  { id: "ts_5", crewMemberId: "crew_ward", date: dateOnly(-1), hours: 7, submitted: false, edits: [] },
];

// ------------------------------------------------------------
// NOTIFICATIONS + ACTIVITY LOG + HEALTH
// ------------------------------------------------------------
const notifications = [
  { id: "n_1", type: "approval_requested", title: "PO-0002 needs review", body: "SkyLine Aerial — drone day, AED 7,400. Awaiting accountant.", createdAt: iso(-1), read: false, linkTo: "/budget" },
  { id: "n_2", type: "task_overdue", title: "Cliff Road permit is blocked", body: "EXT night permit blocked on traffic-management confirmation.", createdAt: iso(-1, 11), read: false, linkTo: "/tasks" },
  { id: "n_3", type: "po_rejected", title: "PO-0004 rejected", body: "TideWater Marine — safety boat to be re-bid separately.", createdAt: iso(-1, 9), read: false, linkTo: "/budget" },
  { id: "n_4", type: "schedule_change", title: "Company move added — Day 3", body: "Cliff Road → Tower Base move at 22:30.", createdAt: iso(-2), read: true, linkTo: "/schedule" },
  { id: "n_5", type: "ai_digest", title: "Daily digest ready", body: "4 shoot days scheduled · 2 POs pending · stunt rig blocked.", createdAt: iso(0, 8), read: false, linkTo: "/dashboard" },
];
const activityLog = [
  { id: "a_1", at: iso(-4), userId: "crew_gaffer", userLabel: "Theo Vance", action: "created", entity: "purchase_order", entityId: "po_1", description: "Submitted PO-0001 (Kessel Grip & Electric, AED 6,800)" },
  { id: "a_2", at: iso(-3), userId: "crew_acct", userLabel: "Dahlia Fenn", action: "approved", entity: "purchase_order", entityId: "po_1", description: "Accountant approved PO-0001" },
  { id: "a_3", at: iso(-3, 14), userId: "user_admin", userLabel: "Administrator", action: "approved", entity: "purchase_order", entityId: "po_1", description: "Admin approved PO-0001" },
  { id: "a_4", at: iso(-2), userId: "crew_1ad", userLabel: "Salma Reyes", action: "updated", entity: "schedule", description: "Added company move to Day 3" },
  { id: "a_5", at: iso(-1), userId: "crew_acct", userLabel: "Dahlia Fenn", action: "rejected", entity: "purchase_order", entityId: "po_4", description: "Rejected PO-0004 — re-bid safety boat" },
  { id: "a_6", at: iso(-1, 12), userId: "crew_1ad", userLabel: "Salma Reyes", action: "completed", entity: "task", entityId: "task_traffic", description: "Completed traffic-management confirmation" },
  { id: "a_7", at: iso(-1, 15), userId: "crew_ward", userLabel: "June Park", action: "status_change", entity: "art_element", entityId: "art_oilskin", description: "Oilskin jacket moved to Ready" },
];
const healthHistory = Array.from({ length: 12 }).map((_, i) => ({
  date: dateOnly(-11 + i),
  health: [55, 57, 60, 59, 63, 66, 65, 69, 70, 73, 72, 75][i],
}));

// ------------------------------------------------------------
// ASSEMBLE
// ------------------------------------------------------------
const projectId = "proj_saltstatic";
const production = {
  id: "prod_saltstatic",
  title: "Salt & Static",
  currency: "AED",
  budget: budgetTotal,
  totalShootDays: shootDays.length,
  currentShootDay: 0,
  plannedPagesPerDay: Math.round((totalPages / shootDays.length) * 10) / 10,
  script: { totalPages: Math.round(totalPages * 10) / 10, totalScenes: scenes.length },
};

const productionData = {
  production,
  crew, cast, scenes, characterBible, locations, shootDays, dood,
  publishedSchedule: { version: 3, publishedAt: iso(-2), lastChanges: [{ sceneId: sceneId("5"), fromDay: 3, toDay: 3 }] },
  locationLockDates: {},
  tasks, budgetLines, purchaseOrders, pettyCash,
  vfxShots, vfxVendors, frequencyPlan, rfEquipment, cameraKits, drones,
  equipmentCheckouts, checklists, artElements, continuityPhotos: [], timesheet,
  notifications, activityLog,
  aiDigest: {
    at: iso(0, 8),
    text:
      "Day 1 (station interiors) is locked and camera-prepped, with the 60kW genny PO approved. The critical path runs through the night exteriors: the Cliff Road / Tower permit is blocked on traffic-management, which in turn holds the tower height-rig safety sign-off and the Day-3/4 aerial reveal. Two POs sit pending — the drone day and the stunt rigging — and TideWater's marine PO was kicked back to re-bid the safety boat. Budget is tracking against a AED " +
      budgetTotal.toLocaleString() +
      " plan with VFX (blackout, aerial extension, lights-return bloom) still to spend.",
    hash: "demo",
    model: "demo",
  },
  healthHistory,
};

// Roles copied from src/data/roles.ts (must stay valid against the app).
const permissionMapFrom = (read, write) => {
  const KEYS = ["breakdown", "schedule", "locations", "tasks", "budget", "vfx", "rf", "camera", "drones", "art", "cast", "timesheet", "reports"];
  const m = {};
  for (const k of KEYS) m[k] = "none";
  for (const k of read) m[k] = "read";
  for (const k of write) m[k] = "write";
  return m;
};
const roles = [
  { id: "admin", label: "Administrator", description: "Full oversight of every project, department, users, roles, and AI.", access: ["all"], builtIn: true },
  { id: "scheduler", label: "1st AD / Scheduler", description: "Owns the shooting schedule, strip board, and DOOD.", access: ["breakdown", "schedule", "locations", "tasks", "cast", "reports"], permissions: permissionMapFrom(["breakdown", "reports"], ["schedule", "locations", "tasks", "cast"]), builtIn: true },
  { id: "accountant", label: "Accountant", description: "Manages the budget, POs, invoices, and petty cash.", department: "accounting", access: ["budget", "tasks", "reports"], permissions: permissionMapFrom(["reports"], ["budget", "tasks"]), builtIn: true },
  { id: "camera", label: "Camera / Technical", description: "Equipment manifests, kit builds, and prep checklists.", department: "camera", access: ["camera", "drones", "breakdown", "schedule", "tasks"], permissions: permissionMapFrom(["breakdown", "schedule"], ["camera", "drones", "tasks"]), builtIn: true },
  { id: "vfx", label: "VFX Supervisor", description: "Shot pipeline, vendor management, plate delivery.", department: "vfx", access: ["vfx", "breakdown", "tasks"], permissions: permissionMapFrom(["breakdown"], ["vfx", "tasks"]), builtIn: true },
  { id: "art", label: "Art / Wardrobe / Props", description: "Element tracking, continuity, and set dressing.", department: "art", access: ["art", "breakdown", "tasks"], permissions: permissionMapFrom(["breakdown"], ["art", "tasks"]), builtIn: true },
  { id: "cast", label: "Cast Coordinator", description: "Cast schedules, DOOD, contracts, and call sheets.", department: "cast", access: ["cast", "schedule", "tasks"], permissions: permissionMapFrom([], ["cast", "schedule", "tasks"]), builtIn: true },
];

// Users — master admin (password "1234", sha256) + a few teammates for presence.
// sha256("1234") = 03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4
const users = [
  { id: "user_admin", username: "Admin", displayName: "Administrator", password: "sha256$03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4", roleId: "admin", active: true, createdAt: iso(-40) },
  { id: "user_salma", username: "salma", displayName: "Salma Reyes", password: "", roleId: "scheduler", active: true, createdAt: iso(-25), inviteCode: "AD1STSLM" },
  { id: "user_dahlia", username: "dahlia", displayName: "Dahlia Fenn", password: "", roleId: "accountant", active: true, createdAt: iso(-25), inviteCode: "ACCTDHL9" },
  { id: "user_wren", username: "wren", displayName: "Wren Alvarez", password: "", roleId: "vfx", active: true, createdAt: iso(-22), inviteCode: "VFXWREN2" },
  { id: "user_marcus", username: "marcus", displayName: "Marcus Reed", password: "", roleId: "camera", active: true, createdAt: iso(-20), inviteCode: "STNTMRC5" },
];

const project = {
  id: projectId,
  name: production.title,
  logline: "A blackout swallows a coastal town; a radio engineer and a fisher's daughter fight through the night to keep one signal alive.",
  createdAt: iso(-40),
  updatedAt: iso(0),
  currency: "AED",
  script: {
    fileName: "salt-and-static.pdf",
    rawText: scenes.map((s) => s.scriptText).join("\n\n"),
    uploadedAt: iso(-39),
    pageCount: Math.ceil(totalPages),
    source: "pdf",
  },
  sceneCount: scenes.length,
  elementCount,
};

const state = {
  ...productionData,
  users,
  roles,
  currentUserId: "user_admin",
  activeRole: "admin",
  tutorialSeen: true,
  sidebarPinned: true,
  projects: [project],
  activeProjectId: projectId,
  projectData: {},
  aiUsage: [
    { id: "u_1", feature: "character_bible", at: iso(-39), inputTokens: 7600, outputTokens: 1200, model: "demo", costUsd: 0 },
    { id: "u_2", feature: "script_breakdown", at: iso(-39), inputTokens: 12800, outputTokens: 4800, model: "demo", costUsd: 0 },
    { id: "u_3", feature: "daily_digest", at: iso(0, 8), inputTokens: 3400, outputTokens: 700, model: "demo", costUsd: 0 },
  ],
  aiConfig: { alertThresholdPct: 80 },
};

const payload = { state, version: 5 };

writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");
console.log(
  `Wrote ${OUT}\n  scenes=${scenes.length} elements=${elementCount} cast=${cast.length} crew=${crew.length} ` +
    `tasks=${tasks.length} POs=${purchaseOrders.length} VFX=${vfxShots.length} drones=${drones.length} ` +
    `budget=AED ${budgetTotal.toLocaleString()} days=${shootDays.length}`
);
