// ============================================================
// Sample-production generator.
//
// Emits public/sample-production.json in SceneTrackable's persisted-store
// shape ({ state, version }), loadable through the same restore path as an
// Admin backup. Source material is O. Henry's "The Gift of the Magi" (1905),
// public domain — adapted here into short screenplay scenes with a full,
// hand-authored breakdown so the demo lands fully dressed without an AI run.
//
//   node scripts/build-sample.mjs
// ============================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "sample-production.json");

// Deterministic ISO helpers, anchored so the production reads as "in prep".
const DAY = 86400000;
const now = new Date("2026-07-19T09:00:00.000Z");
const iso = (offsetDays, h = 9) =>
  new Date(now.getTime() + offsetDays * DAY + (h - 9) * 3600000).toISOString();
const dateOnly = (offsetDays) => iso(offsetDays).slice(0, 10);

// ------------------------------------------------------------
// SCENES — the screenplay + its breakdown
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
    number: "1",
    intExt: "INT",
    location: "Della & Jim's Flat",
    timeOfDay: "DAY",
    synopsis:
      "Della counts the $1.87 she has saved — pennies at a time — and weeps at how little it buys for Jim's gift.",
    pages: 1.5,
    scriptText:
      "INT. DELLA & JIM'S FLAT - DAY\n\nA shabby eight-dollar-a-week furnished flat. DELLA YOUNG, 22, counts a small hoard of coins on a worn coverlet.\n\nDELLA\nOne dollar and eighty-seven cents. And the next day would be Christmas.\n\nShe flops onto the shabby little couch and howls.",
    elements: [
      el("Della Young", "cast", "Lead", "On camera the whole scene"),
      el("Jim Young", "cast", "Lead", "Photograph on the mantel only"),
      el("$1.87 in coins", "props", "Hero", "Pennies + silver, aged"),
      el("Worn coverlet", "props", "Set dressing"),
      el("Shabby couch", "props", "Set dressing"),
      el("Della's day dress", "wardrobe", "Period 1905", "Faded, mended cuffs"),
      el("Gas mantle glow", "sfx", "Practical", "Warm flicker on wall"),
    ],
  },
  {
    number: "2",
    intExt: "INT",
    location: "Della & Jim's Flat",
    timeOfDay: "DAY",
    synopsis: "Della lets down her famous knee-length hair before the pier glass and resolves to sell it.",
    pages: 1.0,
    scriptText:
      "INT. FLAT - BEDROOM ALCOVE - DAY\n\nDella stands before a cheap pier glass and lets down her hair — a shimmering cascade to below her knee.\n\nDELLA (V.O.)\nHer hair was her one glory.",
    elements: [
      el("Della Young", "cast", "Lead"),
      el("Pier glass mirror", "props", "Hero", "Full-length, tarnished"),
      el("Della's hair (wig rig)", "makeup", "Hair", "Knee-length fall — continuity critical"),
      el("Hair-fall reveal", "vfx", "Invisible", "Blend practical fall to actor's line"),
    ],
  },
  {
    number: "3",
    intExt: "EXT",
    location: "Tenement Street",
    timeOfDay: "DAY",
    synopsis: "Della hurries out into the grey winter street, coat clutched, toward the hair shop.",
    pages: 0.5,
    scriptText:
      "EXT. TENEMENT STREET - DAY\n\nDella hurries down a slush-grey street, cheeks bright. A NEWSBOY hawks papers. She turns a corner beneath a swinging sign.",
    elements: [
      el("Della Young", "cast", "Lead"),
      el("Newsboy", "extras", "Featured", "Hawks papers, 1 line"),
      el("Street crowd", "extras", "Background", "12 period pedestrians"),
      el("Della's winter coat", "wardrobe", "Period 1905", "Brown, old, worn thin"),
      el("Falling snow", "sfx", "Atmos", "Snow machine, wide"),
      el("Period signage", "props", "Set dressing", "Swinging shop sign"),
      el("Horse & cart", "vehicles", "Period", "Background dressing"),
    ],
  },
  {
    number: "4",
    intExt: "INT",
    location: "Mme. Sofronie's Hair Emporium",
    timeOfDay: "DAY",
    synopsis: "Madame Sofronie appraises and buys Della's hair for twenty dollars. The shears fall.",
    pages: 1.75,
    scriptText:
      "INT. MME. SOFRONIE'S HAIR EMPORIUM - DAY\n\nMADAME SOFRONIE, large, cold, weighs Della's loosened hair in one hand.\n\nSOFRONIE\nTwenty dollars.\n\nDELLA\nGive it to me quick.\n\nSNIP. The shears close.",
    elements: [
      el("Della Young", "cast", "Lead"),
      el("Madame Sofronie", "cast", "Supporting", "Cold, businesslike"),
      el("Barber shears", "props", "Hero", "Period, sprung steel — SFX for the snip"),
      el("$20 gold note", "props", "Hero"),
      el("Hair-cut effect", "vfx", "Invisible", "Actor keeps hair; sell the cut"),
      el("Sofronie's shop coat", "wardrobe", "Period 1905"),
      el("Wall of switches & wigs", "props", "Set dressing", "Period hairpieces"),
    ],
  },
  {
    number: "5",
    intExt: "INT",
    location: "Jeweler's Shop",
    timeOfDay: "DAY",
    synopsis: "Della finds THE gift — a simple platinum fob chain for Jim's heirloom watch.",
    pages: 1.0,
    scriptText:
      "INT. JEWELER'S SHOP - DAY\n\nA quiet, gleaming counter. The JEWELER lays out a platinum fob chain, simple and chaste.\n\nDELLA\nThat one. For his watch.",
    elements: [
      el("Della Young", "cast", "Lead"),
      el("Jeweler", "cast", "Day Player", "1 line"),
      el("Platinum fob chain", "props", "Hero", "The gift — $21"),
      el("Glass jewel counter", "props", "Set dressing"),
      el("Jeweler's loupe", "props", "Hand prop"),
    ],
  },
  {
    number: "6",
    intExt: "INT",
    location: "Della & Jim's Flat",
    timeOfDay: "DAY",
    synopsis: "Home again, Della curls her cropped hair into tiny ringlets and starts the coffee.",
    pages: 1.25,
    scriptText:
      "INT. FLAT - DAY (LATER)\n\nDella wields the curling irons on her cropped head, making close-lying little curls. She sets coffee to boil.\n\nDELLA\nPlease God, make him think I am still pretty.",
    elements: [
      el("Della Young", "cast", "Lead"),
      el("Curling irons", "props", "Hero", "Heated on the gas ring"),
      el("Cropped-hair look", "makeup", "Hair", "Continuity: matches sc. 4 onward"),
      el("Coffee pot & ring", "props", "Set dressing"),
      el("Gas ring flame", "sfx", "Practical"),
    ],
  },
  {
    number: "7",
    intExt: "INT",
    location: "Della & Jim's Flat",
    timeOfDay: "DUSK",
    synopsis: "Jim comes home, freezes in the doorway at the sight of Della's shorn hair.",
    pages: 1.5,
    scriptText:
      "INT. FLAT - DUSK\n\nThe door opens. JIM YOUNG, 22, thin and burdened in a coat that needs replacing, stops still. His eyes fix on Della — an expression she cannot read.\n\nDELLA\nJim, darling, don't look at me that way.",
    elements: [
      el("Della Young", "cast", "Lead"),
      el("Jim Young", "cast", "Lead", "First full appearance"),
      el("Jim's overcoat", "wardrobe", "Period 1905", "Needs replacing — no gloves"),
      el("Doorway key light", "sfx", "Lighting", "Cold hallway spill"),
      el("Golden-hour push", "vfx", "Invisible", "Warm the dusk window"),
    ],
  },
  {
    number: "8",
    intExt: "INT",
    location: "Della & Jim's Flat",
    timeOfDay: "NIGHT",
    synopsis:
      "The gifts are exchanged: Jim's tortoise-shell combs for hair now gone; Della's fob for the watch Jim has sold to buy the combs.",
    pages: 2.25,
    scriptText:
      "INT. FLAT - NIGHT\n\nJim tosses a package on the table. Inside: THE COMBS — pure tortoise shell, jeweled rims — the set Della worshipped in a Broadway window.\n\nDELLA\nMy hair grows so fast, Jim!\n\nShe presses the fob into his palm. Jim smiles, and sinks onto the couch.\n\nJIM\nI sold the watch to get your combs.",
    elements: [
      el("Della Young", "cast", "Lead"),
      el("Jim Young", "cast", "Lead"),
      el("Tortoise-shell combs", "props", "Hero", "Jeweled rims — matched pair"),
      el("Platinum fob chain", "props", "Hero", "Payoff of sc. 5"),
      el("Jim's heirloom watch", "props", "Hero", "Referenced; sold off-screen"),
      el("Wrapped parcels", "props", "Set dressing"),
      el("Practical table lamp", "sfx", "Lighting"),
    ],
  },
  {
    number: "8A",
    intExt: "EXT",
    location: "Tenement Street",
    timeOfDay: "NIGHT",
    synopsis: "INSERT — snow settles over the gas-lit street as the flat's window glows. Aerial pull-up.",
    pages: 0.5,
    scriptText:
      "EXT. TENEMENT STREET - NIGHT (INSERT)\n\nSnow settling. Gas lamps haloed. We rise — an aerial pull-up — from the one warm window in a cold city.",
    elements: [
      el("Gas lamp haloes", "sfx", "Atmos", "Practical flame + haze"),
      el("Falling snow", "sfx", "Atmos", "Overhead snow rig"),
      el("Aerial pull-up", "vfx", "Drone plate", "Stabilize + sky replace"),
      el("City skyline extension", "vfx", "Environment", "1905 rooftops matte"),
      el("Snow-covered street", "props", "Set dressing"),
    ],
  },
  {
    number: "9",
    intExt: "INT",
    location: "Della & Jim's Flat",
    timeOfDay: "NIGHT",
    synopsis:
      "They put their gifts away and sit to supper. NARRATOR closes on the wisdom of the magi.",
    pages: 1.0,
    scriptText:
      "INT. FLAT - NIGHT\n\nThey put their presents away and Jim starts the chops on the fire.\n\nNARRATOR (V.O.)\nOf all who give gifts, these two were wisest. They are the magi.",
    elements: [
      el("Della Young", "cast", "Lead"),
      el("Jim Young", "cast", "Lead"),
      el("Chops & skillet", "props", "Set dressing", "Steam — food stylist"),
      el("Firelight glow", "sfx", "Lighting", "Practical grate"),
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

// scenes a character appears in
const scenesFor = (charName) =>
  scenes.filter((s) => s.elements.some((e) => e.category === "cast" && e.name === charName)).map((s) => s.id);

// ------------------------------------------------------------
// CHARACTER BIBLE
// ------------------------------------------------------------
const characterBible = [
  { name: "Della Young", speaking: true, importance: "lead", description: "The wife. Sells her hair to buy Jim a gift.", firstSceneNumber: "1" },
  { name: "Jim Young", aliases: ["James Dillingham Young"], speaking: true, importance: "lead", description: "The husband. Sells his watch to buy Della's combs.", firstSceneNumber: "7" },
  { name: "Madame Sofronie", speaking: true, importance: "supporting", description: "Hair-goods dealer, cold and quick.", firstSceneNumber: "4" },
  { name: "Jeweler", speaking: true, importance: "minor", description: "Sells Della the fob chain.", firstSceneNumber: "5" },
  { name: "Newsboy", speaking: true, importance: "background", description: "Street atmosphere.", firstSceneNumber: "3" },
];

// ------------------------------------------------------------
// CAST
// ------------------------------------------------------------
const cast = [
  { id: "cast_della", name: "Eleanor Vance", role: "Della Young", category: "lead", scenes: scenesFor("Della Young"), ratePerDay: 3200, agent: "Meyer Talent", contact: "eleanor@example.com", gender: "F" },
  { id: "cast_jim", name: "Thomas Reyes", role: "Jim Young", category: "lead", scenes: scenesFor("Jim Young"), ratePerDay: 3000, agent: "Meyer Talent", contact: "thomas@example.com", gender: "M" },
  { id: "cast_sofronie", name: "Marguerite Bell", role: "Madame Sofronie", category: "supporting", scenes: scenesFor("Madame Sofronie"), ratePerDay: 1400, agent: "Cornerstone Artists", gender: "F" },
  { id: "cast_jeweler", name: "Harold Pike", role: "Jeweler", category: "day_player", scenes: scenesFor("Jeweler"), ratePerDay: 850, gender: "M" },
  { id: "cast_newsboy", name: "Sam O'Dell", role: "Newsboy", category: "day_player", scenes: scenesFor("Newsboy"), ratePerDay: 600, gender: "M" },
];

// ------------------------------------------------------------
// CREW
// ------------------------------------------------------------
const crew = [
  { id: "crew_dp", name: "Ada Whitfield", role: "Director of Photography", department: "camera", email: "ada@overexposure.example", ratePerHour: 95, otRateMultiplier: 1.5 },
  { id: "crew_gaffer", name: "Marco Ines", role: "Gaffer", department: "camera", email: "marco@overexposure.example", ratePerHour: 62, otRateMultiplier: 1.5 },
  { id: "crew_1ad", name: "Priya Nadar", role: "1st Assistant Director", department: "production", email: "priya@overexposure.example", ratePerHour: 78 },
  { id: "crew_art", name: "Lena Fisk", role: "Production Designer", department: "art", email: "lena@overexposure.example", ratePerHour: 70 },
  { id: "crew_ward", name: "Yuki Tanaka", role: "Costume Designer", department: "wardrobe", email: "yuki@overexposure.example", ratePerHour: 58 },
  { id: "crew_sound", name: "Dev Okafor", role: "Production Sound Mixer", department: "sound", email: "dev@overexposure.example", ratePerHour: 64 },
  { id: "crew_vfx", name: "Rosa Klein", role: "VFX Supervisor", department: "vfx", email: "rosa@overexposure.example", ratePerHour: 88 },
  { id: "crew_acct", name: "George Amaro", role: "Production Accountant", department: "accounting", email: "george@overexposure.example", ratePerHour: 60 },
];

// ------------------------------------------------------------
// LOCATIONS
// ------------------------------------------------------------
const locations = [
  { id: "loc_flat", name: "Della & Jim's Flat", type: "INT", address: "Stage 3, OverExposure Lot", contactName: "Studio Ops", contactPhone: "+1 555 0100", permitStatus: "locked", lockDate: dateOnly(6), parkingNotes: "Crew lot B", powerNotes: "House power + genny backup", costPerDay: 1800, notes: "Standing set — dressed for period 1905." },
  { id: "loc_hair", name: "Mme. Sofronie's Hair Emporium", type: "INT", address: "41 Cannery Row (practical)", contactName: "R. Mendez", contactPhone: "+1 555 0142", permitStatus: "permit_pending", parkingNotes: "Street parking, permits pulled", costPerDay: 1200 },
  { id: "loc_street", name: "Tenement Street", type: "EXT", address: "Heritage Alley, Old Town", contactName: "City Film Office", contactPhone: "+1 555 0170", permitStatus: "optioned", parkingNotes: "Rolling road closure 6a–2p", powerNotes: "Tie-in + 2× 6kW genny for snow rig", costPerDay: 2400, notes: "Night work — neighbour notice filed." },
  { id: "loc_jewel", name: "Jeweler's Shop", type: "INT", address: "Heritage Alley, Old Town (adjacent)", contactName: "City Film Office", permitStatus: "scouting", costPerDay: 900 },
];

// ------------------------------------------------------------
// SCHEDULE — 3 shoot days, day 2 is a company move (multi-location)
// ------------------------------------------------------------
const shootDays = [
  {
    id: "day_1", dayNumber: 1, date: dateOnly(6), location: "Della & Jim's Flat",
    locations: ["Della & Jim's Flat"],
    estimatedHours: 11, callTime: "07:00", wrapTime: "18:00", weather: "Clear, 4°C",
    scenes: [sceneId("1"), sceneId("2"), sceneId("6")],
    banners: [{ type: "meal", label: "Lunch 12:30 (30 crew)" }],
  },
  {
    id: "day_2", dayNumber: 2, date: dateOnly(7), location: "Tenement Street",
    locations: ["Tenement Street", "Mme. Sofronie's Hair Emporium", "Jeweler's Shop"],
    estimatedHours: 12, callTime: "06:30", wrapTime: "18:30", weather: "Overcast, snow FX",
    scenes: [sceneId("3"), sceneId("4"), sceneId("5")],
    banners: [{ type: "company_move", label: "Company move → Hair Emporium 11:00" }, { type: "meal", label: "Lunch 13:00" }],
  },
  {
    id: "day_3", dayNumber: 3, date: dateOnly(8), location: "Della & Jim's Flat",
    locations: ["Della & Jim's Flat", "Tenement Street"],
    estimatedHours: 12, callTime: "13:00", wrapTime: "01:00", weather: "Night — clear",
    scenes: [sceneId("7"), sceneId("8"), sceneId("8A"), sceneId("9")],
    banners: [{ type: "meal", label: "Second meal 19:30" }, { type: "company_move", label: "Split company: aerial unit on street" }],
  },
];

// ------------------------------------------------------------
// DOOD — cast x day
// ------------------------------------------------------------
const dood = {
  cast_della: { 1: "SW", 2: "W", 3: "WF" },
  cast_jim: { 1: "H", 2: "OFF", 3: "SWF" },
  cast_sofronie: { 1: "OFF", 2: "SWF", 3: "OFF" },
  cast_jeweler: { 1: "OFF", 2: "SWF", 3: "OFF" },
  cast_newsboy: { 1: "OFF", 2: "SWF", 3: "OFF" },
};

// ------------------------------------------------------------
// TASKS
// ------------------------------------------------------------
const task = (id, title, owner, department, deadlineOffset, status, priority, extra = {}) => ({
  id, title, owner, department,
  deadlineRule: `manual(${dateOnly(deadlineOffset)})`,
  computedDeadline: iso(deadlineOffset, 18),
  status, priority,
  createdAt: iso(-4), updatedAt: iso(-1),
  ...extra,
});
const tasks = [
  task("task_combs", "Source hero tortoise-shell combs (matched pair)", "crew_art", "art", 4, "in_progress", "high", { linkedScene: sceneId("8"), description: "Jeweled rims. Two identical for continuity + backup." }),
  task("task_fob", "Fabricate platinum fob chain + backup", "crew_art", "props", 4, "in_progress", "high", { linkedScene: sceneId("5") }),
  task("task_wig", "Della knee-length hair fall — fitting & test", "crew_ward", "wardrobe", 3, "review", "critical", { linkedScene: sceneId("2"), description: "Wig rig for the cut; blends to actor." }),
  task("task_snow", "Confirm snow rig + 2× genny for street night", "crew_gaffer", "camera", 6, "not_started", "high", { linkedShootDay: 3, linkedScene: sceneId("8A") }),
  task("task_permit", "Pull EXT night permit — Tenement Street", "crew_1ad", "production", 2, "blocked", "critical", { blockedBy: ["task_neighbour"], description: "Waiting on neighbour sign-off." }),
  task("task_neighbour", "Neighbour notice — night shoot", "crew_1ad", "production", 1, "completed", "medium", {}),
  task("task_drone", "Drone aerial pull-up — flight plan + waiver", "crew_dp", "camera", 6, "not_started", "medium", { linkedScene: sceneId("8A"), linkedShootDay: 3 }),
  task("task_watch", "Age & dress Jim's heirloom watch", "crew_art", "props", 5, "not_started", "medium", { linkedScene: sceneId("8") }),
  task("task_call1", "Distribute Day 1 call sheet", "crew_1ad", "production", 5, "not_started", "medium", { linkedShootDay: 1 }),
];

// ------------------------------------------------------------
// BUDGET
// ------------------------------------------------------------
const budgetLines = [
  { id: "bl_atl_1", code: "1100", category: "Above the Line", subcategory: "Cast", department: "cast", description: "Principal cast", budgeted: 42000, committed: 38000, spent: 12800 },
  { id: "bl_atl_2", code: "1200", category: "Above the Line", subcategory: "Director/Producer", department: "production", description: "Director & producer fees", budgeted: 55000, committed: 55000, spent: 27500 },
  { id: "bl_cam", code: "2100", category: "Production", subcategory: "Camera", department: "camera", description: "Camera package + grip/electric", budgeted: 48000, committed: 41000, spent: 9200 },
  { id: "bl_art", code: "2200", category: "Production", subcategory: "Art/Set", department: "art", description: "Period set dressing & props", budgeted: 36000, committed: 22000, spent: 14300 },
  { id: "bl_ward", code: "2300", category: "Production", subcategory: "Wardrobe", department: "wardrobe", description: "Period costume & hair", budgeted: 24000, committed: 18500, spent: 8900 },
  { id: "bl_loc", code: "2400", category: "Production", subcategory: "Locations", department: "production", description: "Location fees & permits", budgeted: 21000, committed: 12300, spent: 4100 },
  { id: "bl_vfx", code: "3100", category: "Post", subcategory: "VFX", department: "vfx", description: "Snow, cut, aerial cleanup", budgeted: 30000, committed: 15000, spent: 0 },
  { id: "bl_sound", code: "3200", category: "Post", subcategory: "Sound", department: "sound", description: "Production sound + mix", budgeted: 16000, committed: 9000, spent: 3200 },
];
const budgetTotal = budgetLines.reduce((n, b) => n + b.budgeted, 0);

const purchaseOrders = [
  {
    id: "po_1", number: "PO-0001", vendor: "Heritage Prop House", description: "Tortoise-shell combs (2) + platinum fob stock",
    amount: 4200, currency: "AED", accountCode: "2200", department: "art", linkedScene: sceneId("8"),
    requestedBy: "crew_art", requestedAt: iso(-3), status: "approved",
    approvals: [
      { step: "accountant", by: "crew_acct", at: iso(-2), decision: "approved", note: "Within art line." },
      { step: "admin", by: "user_admin", at: iso(-2, 14), decision: "approved" },
    ],
    auditLog: [{ at: iso(-3), by: "crew_art", action: "submitted" }, { at: iso(-2), by: "crew_acct", action: "accountant_approved" }, { at: iso(-2, 14), by: "user_admin", action: "admin_approved" }],
  },
  {
    id: "po_2", number: "PO-0002", vendor: "NorthStar Aerial", description: "Drone day + operator — street aerial",
    amount: 5600, currency: "AED", accountCode: "2100", department: "camera", linkedShootDay: 3,
    requestedBy: "crew_dp", requestedAt: iso(-1), status: "accountant_review",
    approvals: [], auditLog: [{ at: iso(-1), by: "crew_dp", action: "submitted" }],
  },
  {
    id: "po_3", number: "PO-0003", vendor: "SnowFX Rentals", description: "Snow machines ×2 + haze, 1 night",
    amount: 3100, currency: "AED", accountCode: "2100", department: "camera", linkedShootDay: 3,
    requestedBy: "crew_gaffer", requestedAt: iso(0), status: "submitted",
    approvals: [], auditLog: [{ at: iso(0), by: "crew_gaffer", action: "submitted" }],
  },
];

const pettyCash = [
  { id: "pc_1", date: iso(-2), amount: 180, currency: "AED", description: "Aging supplies — watch & fob", department: "art", loggedBy: "crew_art" },
  { id: "pc_2", date: iso(-1), amount: 95, currency: "AED", description: "Coffee & craft — fitting day", department: "production", loggedBy: "crew_1ad" },
];

// ------------------------------------------------------------
// VFX
// ------------------------------------------------------------
const vfxVendors = [
  { id: "vend_aurora", name: "Aurora Post", contact: "ops@aurora.example", city: "Vancouver", assignedShots: ["vfx_snow", "vfx_aerial"], onTimePercent: 92 },
  { id: "vend_inhouse", name: "In-house Unit", contact: "rosa@overexposure.example", city: "Local", assignedShots: ["vfx_haircut"], onTimePercent: 100 },
];
const vfxShots = [
  { id: "vfx_haircut", shotNumber: "004_010", sceneId: sceneId("4"), description: "Sell the hair cut without cutting actor's hair", complexity: "moderate", status: "in_progress", vendorId: "vend_inhouse", reviewRounds: 3, reviewsCompleted: 1, plateDeliveryDate: dateOnly(10), finalDueDate: dateOnly(24) },
  { id: "vfx_snow", shotNumber: "008A_020", sceneId: sceneId("8A"), description: "Snow enhancement + gas-lamp haze", complexity: "moderate", status: "awarded", vendorId: "vend_aurora", reviewRounds: 2, reviewsCompleted: 0, plateDeliveryDate: dateOnly(12), finalDueDate: dateOnly(30) },
  { id: "vfx_aerial", shotNumber: "008A_030", sceneId: sceneId("8A"), description: "Aerial pull-up: stabilize, sky replace, 1905 skyline extension", complexity: "complex", status: "bid", vendorId: "vend_aurora", reviewRounds: 3, reviewsCompleted: 0, finalDueDate: dateOnly(34) },
];

// ------------------------------------------------------------
// RF / COMMS
// ------------------------------------------------------------
const frequencyPlan = [
  { id: "fp_1", shootDay: 1, location: "Della & Jim's Flat", device: "Lav TX — Della", frequencyMHz: 518.25, powerMW: 50, channel: "A1" },
  { id: "fp_2", shootDay: 1, location: "Della & Jim's Flat", device: "Lav TX — Jim", frequencyMHz: 521.5, powerMW: 50, channel: "A2" },
  { id: "fp_3", shootDay: 2, location: "Tenement Street", device: "Boom hop TX", frequencyMHz: 537.0, powerMW: 100, channel: "B1", notes: "Coordinate with city — congested band." },
  { id: "fp_4", shootDay: 3, location: "Tenement Street", device: "IFB — director", frequencyMHz: 216.5, powerMW: 25, channel: "IFB" },
];
const rfEquipment = [
  { id: "rf_1", type: "Wireless TX", model: "Wisycom MTP61", serial: "WX-1187", status: "assigned", assignedShootDay: 1, manufacturer: "Wisycom" },
  { id: "rf_2", type: "Wireless RX", model: "Wisycom MCR54", serial: "WX-3320", status: "assigned", assignedShootDay: 1, manufacturer: "Wisycom" },
  { id: "rf_3", type: "IFB", model: "Lectrosonics IFBT4", serial: "LE-0091", status: "available", manufacturer: "Lectrosonics" },
];

// ------------------------------------------------------------
// CAMERA / DRONES
// ------------------------------------------------------------
const cameraKits = [
  { id: "kit_a", name: "A-Cam — ALEXA 35 + Cooke S4", items: ["ALEXA 35 body", "Cooke S4/i 18–100 set", "Cinesaddle + head", "2× 1TB drives"], assignedShootDay: 1, manufacturer: "ARRI" },
  { id: "kit_b", name: "B-Cam — ALEXA Mini LF", items: ["ALEXA Mini LF", "Signature Primes 35/50/75", "Easyrig"], assignedShootDay: 3, manufacturer: "ARRI" },
];
const drones = [
  { id: "drone_1", model: "Inspire 3", manufacturer: "DJI", serial: "DJI-INS3-441", weightGrams: 3995, regStatus: "registered", operatorName: "Kit Alvarez", operatorLicense: "UAS-88213", operatorRatePerDay: 2200, droneRatePerDay: 1400, assignedShootDay: 3, status: "assigned", notes: "Street aerial pull-up, sc. 8A. Night waiver filed." },
];

const equipmentCheckouts = [
  { id: "co_1", item: "ALEXA 35 body (A-Cam)", checkedOutBy: "crew_dp", checkoutAt: iso(-1), condition: "Prep — clean" },
];
const checklists = [
  { id: "cl_1", title: "Camera prep — Day 1", shootDay: 1, items: [
    { id: "cli_1", label: "Sensor clean + back-focus", done: true, doneAt: iso(-1), doneBy: "crew_dp" },
    { id: "cli_2", label: "Build A-cam + follow focus", done: true, doneAt: iso(-1), doneBy: "crew_gaffer" },
    { id: "cli_3", label: "Media format + speed test", done: false },
    { id: "cli_4", label: "Batteries cycled", done: false },
  ] },
];

// ------------------------------------------------------------
// ART / WARDROBE elements
// ------------------------------------------------------------
const artElements = [
  { id: "art_combs", name: "Tortoise-shell combs (hero pair)", category: "prop", sceneIds: [sceneId("8")], characterName: "Della Young", status: "in_progress", cost: 2600, notes: "Jeweled rims; backup identical." },
  { id: "art_fob", name: "Platinum fob chain", category: "prop", sceneIds: [sceneId("5"), sceneId("8")], status: "sourced", cost: 900 },
  { id: "art_watch", name: "Jim's heirloom watch", category: "prop", sceneIds: [sceneId("8")], characterName: "Jim Young", status: "needed", cost: 1200 },
  { id: "art_coat_della", name: "Della's winter coat", category: "wardrobe", sceneIds: [sceneId("3")], characterName: "Della Young", status: "fitting", cost: 700 },
  { id: "art_coat_jim", name: "Jim's overcoat (worn)", category: "wardrobe", sceneIds: [sceneId("7"), sceneId("8")], characterName: "Jim Young", status: "sourced", cost: 640 },
  { id: "art_wig", name: "Della knee-length hair fall", category: "makeup", sceneIds: [sceneId("2"), sceneId("4")], characterName: "Della Young", status: "ready", cost: 1500, notes: "Continuity-critical." },
  { id: "art_shears", name: "Period barber shears", category: "prop", sceneIds: [sceneId("4")], status: "ready", cost: 220 },
];

// ------------------------------------------------------------
// TIMESHEET — prep days already logged
// ------------------------------------------------------------
const timesheet = [
  { id: "ts_1", crewMemberId: "crew_dp", date: dateOnly(-1), hours: 10, submitted: true, submittedAt: iso(-1, 19), edits: [] },
  { id: "ts_2", crewMemberId: "crew_gaffer", date: dateOnly(-1), hours: 10.5, submitted: true, submittedAt: iso(-1, 19), edits: [{ at: iso(-1, 20), by: "user_admin", fromHours: 10, toHours: 10.5, isAdminOverride: true }] },
  { id: "ts_3", crewMemberId: "crew_art", date: dateOnly(-1), hours: 9, submitted: true, submittedAt: iso(-1, 18), edits: [] },
  { id: "ts_4", crewMemberId: "crew_ward", date: dateOnly(-1), hours: 8, submitted: false, edits: [] },
];

// ------------------------------------------------------------
// NOTIFICATIONS + ACTIVITY LOG + HEALTH
// ------------------------------------------------------------
const notifications = [
  { id: "n_1", type: "approval_requested", title: "PO-0002 needs review", body: "NorthStar Aerial — drone day, AED 5,600. Awaiting accountant.", createdAt: iso(-1), read: false, linkTo: "/budget" },
  { id: "n_2", type: "task_overdue", title: "EXT night permit is blocked", body: "Tenement Street permit is blocked by neighbour sign-off.", createdAt: iso(-1, 11), read: false, linkTo: "/tasks" },
  { id: "n_3", type: "schedule_change", title: "Company move added — Day 2", body: "Hair Emporium → Jeweler's Shop move at 11:00.", createdAt: iso(-2), read: true, linkTo: "/schedule" },
  { id: "n_4", type: "ai_digest", title: "Daily digest ready", body: "3 shoot days scheduled · 2 POs pending · wig fitting in review.", createdAt: iso(0, 8), read: false, linkTo: "/dashboard" },
];
const activityLog = [
  { id: "a_1", at: iso(-3), userId: "crew_art", userLabel: "Lena Fisk", action: "created", entity: "purchase_order", entityId: "po_1", description: "Submitted PO-0001 (Heritage Prop House, AED 4,200)" },
  { id: "a_2", at: iso(-2), userId: "crew_acct", userLabel: "George Amaro", action: "approved", entity: "purchase_order", entityId: "po_1", description: "Accountant approved PO-0001" },
  { id: "a_3", at: iso(-2, 14), userId: "user_admin", userLabel: "Administrator", action: "approved", entity: "purchase_order", entityId: "po_1", description: "Admin approved PO-0001" },
  { id: "a_4", at: iso(-2), userId: "crew_1ad", userLabel: "Priya Nadar", action: "updated", entity: "schedule", description: "Added company move to Day 2" },
  { id: "a_5", at: iso(-1), userId: "crew_ward", userLabel: "Yuki Tanaka", action: "status_change", entity: "art_element", entityId: "art_wig", description: "Hair fall moved to Ready" },
  { id: "a_6", at: iso(-1, 12), userId: "crew_1ad", userLabel: "Priya Nadar", action: "completed", entity: "task", entityId: "task_neighbour", description: "Completed neighbour notice" },
];
const healthHistory = Array.from({ length: 12 }).map((_, i) => ({
  date: dateOnly(-11 + i),
  health: [58, 61, 60, 64, 67, 66, 70, 72, 71, 74, 76, 78][i],
}));

// ------------------------------------------------------------
// ASSEMBLE
// ------------------------------------------------------------
const projectId = "proj_magi";
const production = {
  id: "prod_magi",
  title: "The Gift of the Magi",
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
  publishedSchedule: { version: 2, publishedAt: iso(-2), lastChanges: [{ sceneId: sceneId("5"), fromDay: 1, toDay: 2 }] },
  locationLockDates: {},
  tasks, budgetLines, purchaseOrders, pettyCash,
  vfxShots, vfxVendors, frequencyPlan, rfEquipment, cameraKits, drones,
  equipmentCheckouts, checklists, artElements, continuityPhotos: [], timesheet,
  notifications, activityLog,
  aiDigest: {
    at: iso(0, 8),
    text: "Day 1 (flat interiors) is locked and camera-prepped. Two POs are pending — the aerial day and the snow package — both tied to the Day-3 night. The knee-length hair fall cleared to Ready, but the EXT night permit is blocked on a neighbour sign-off; clearing it is the critical path to the aerial pull-up (sc. 8A). Budget is tracking at 100% committed against a AED " + budgetTotal.toLocaleString() + " plan.",
    hash: "sample",
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
  { id: "user_admin", username: "Admin", displayName: "Administrator", password: "sha256$03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4", roleId: "admin", active: true, createdAt: iso(-30) },
  { id: "user_priya", username: "priya", displayName: "Priya Nadar", password: "", roleId: "scheduler", active: true, createdAt: iso(-20), inviteCode: "AD1STXYZ" },
  { id: "user_george", username: "george", displayName: "George Amaro", password: "", roleId: "accountant", active: true, createdAt: iso(-20), inviteCode: "ACCT4421" },
  { id: "user_rosa", username: "rosa", displayName: "Rosa Klein", password: "", roleId: "vfx", active: true, createdAt: iso(-18), inviteCode: "VFX99KLN" },
];

const project = {
  id: projectId,
  name: production.title,
  logline: "A young couple, too poor for Christmas, each sell their dearest possession to gift the other — O. Henry, 1905.",
  createdAt: iso(-30),
  updatedAt: iso(0),
  currency: "AED",
  script: {
    fileName: "gift-of-the-magi.pdf",
    rawText: scenes.map((s) => s.scriptText).join("\n\n"),
    uploadedAt: iso(-29),
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
    { id: "u_1", feature: "character_bible", at: iso(-29), inputTokens: 8200, outputTokens: 1400, model: "demo", costUsd: 0 },
    { id: "u_2", feature: "script_breakdown", at: iso(-29), inputTokens: 14100, outputTokens: 5200, model: "demo", costUsd: 0 },
  ],
  aiConfig: { alertThresholdPct: 80 },
};

const payload = { state, version: 5 };

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");
console.log(
  `Wrote ${OUT}\n  scenes=${scenes.length} elements=${elementCount} cast=${cast.length} crew=${crew.length} ` +
    `tasks=${tasks.length} POs=${purchaseOrders.length} budget=AED ${budgetTotal.toLocaleString()} days=${shootDays.length}`
);
