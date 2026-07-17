// ============================================================
// SCENETRACKABLE — TYPE SYSTEM
// ============================================================

export type RoleId = string;

// ------------------------------------------------------------
// AUTH — users & sessions
// ------------------------------------------------------------
export interface User {
  id: string;
  username: string;
  displayName: string;
  password: string; // sha256$… hash. Empty string = user must redeem invite before login.
  roleId: string; // references Role.id
  active: boolean;
  createdAt: string;
  /** One-time code the admin issues; the user redeems it on first login to set their password. */
  inviteCode?: string;
}

export type DepartmentId =
  | "production"
  | "camera"
  | "sound"
  | "vfx"
  | "art"
  | "wardrobe"
  | "props"
  | "accounting"
  | "transport"
  | "rf"
  | "cast";

/** What a role may do on one page. */
export type PermissionLevel = "none" | "read" | "write";

export type RolePermissions = Record<string, PermissionLevel>;

export interface Role {
  id: RoleId;
  label: string;
  description: string;
  department?: DepartmentId;
  /**
   * Page keys the role can open, or ["all"] for full admin access. Derived from
   * `permissions` (every key that isn't "none") and kept in sync by the store —
   * it stays the single check for "is this page visible at all".
   */
  access: string[];
  /**
   * Per-page read/write level. Absent on roles written before levels existed;
   * `permissionFor` falls back to treating their `access` entries as "write",
   * which is what those roles actually granted.
   */
  permissions?: RolePermissions;
  builtIn?: boolean; // seed roles that cannot be deleted
}

/** A role has full admin powers (user/role management + AI settings). */
export function isAdminRole(role: Role | undefined | null): boolean {
  return !!role && role.access.includes("all");
}

/** The level a role holds on one page key. Admins are "write" everywhere. */
export function permissionFor(role: Role | undefined | null, key: string): PermissionLevel {
  if (!role) return "none";
  if (isAdminRole(role)) return "write";
  const level = role.permissions?.[key];
  if (level) return level;
  // Pre-levels role: having the page listed meant full edit rights.
  return role.access.includes(key) ? "write" : "none";
}

/** The `access` list implied by a permission map — every page that isn't "none". */
export function accessFromPermissions(permissions: RolePermissions): string[] {
  return Object.entries(permissions)
    .filter(([, level]) => level !== "none")
    .map(([key]) => key);
}

export interface CrewMember {
  id: string;
  name: string;
  role: string;
  department: DepartmentId;
  roleId?: RoleId;
  email?: string;
  ratePerHour?: number;
  otRateMultiplier?: number;
}

// ============================================================
// SCRIPT & BREAKDOWN
// ============================================================

export type ElementCategory =
  | "cast"
  | "extras"
  | "props"
  | "wardrobe"
  | "sfx"
  | "vfx"
  | "vehicles"
  | "animals"
  | "locations"
  | "makeup"
  | "stunts"
  | "production"; // production requirements (permits, crane, generator, etc.)

export interface BreakdownElement {
  id: string;
  name: string;
  category: ElementCategory;
  subCategory?: string;
  description?: string;
  notes?: string;
  linkedDepartment?: DepartmentId;
}

export type CharacterImportance = "lead" | "supporting" | "minor" | "background";

/** One character as identified by the AI character-bible pass over a script. */
export interface ScriptCharacter {
  name: string;
  aliases?: string[];
  speaking: boolean;
  importance: CharacterImportance;
  description?: string;
  firstSceneNumber?: string;
}

export interface Scene {
  id: string;
  number: string; // e.g. "42A"
  intExt: "INT" | "EXT" | "INT/EXT";
  location: string;
  timeOfDay: "DAY" | "NIGHT" | "DAWN" | "DUSK";
  synopsis: string;
  scriptText: string;
  pages: number; // eighths, e.g. 2.375
  estimatedShootMinutes: number;
  elements: BreakdownElement[];
  vfxFlags: boolean;
  sfxFlags: boolean;
  notes?: string;
}

// ============================================================
// LOCATIONS
// ============================================================

export type LocationPermitStatus =
  | "scouting"
  | "optioned"
  | "permit_pending"
  | "locked"
  | "wrapped";

export interface ProductionLocation {
  id: string;
  name: string; // canonical name used in scene headings
  aliases?: string[]; // other spellings that appear in the script
  type: "INT" | "EXT" | "INT/EXT" | "STAGE";
  address?: string;
  contactName?: string;
  contactPhone?: string;
  permitStatus: LocationPermitStatus;
  lockDate?: string; // ISO — supersedes locationLockDates entries
  parkingNotes?: string;
  powerNotes?: string;
  costPerDay?: number;
  notes?: string;
  createdByAI?: boolean;
}

// ============================================================
// SCHEDULE
// ============================================================

export interface ShootDay {
  id: string;
  dayNumber: number;
  date: string; // ISO
  location: string;
  estimatedHours: number;
  scenes: string[]; // scene IDs
  banners?: { type: "meal" | "company_move" | "day_off"; label: string }[];
  weather?: string;
  callTime?: string;
  wrapTime?: string;
}

/** A shoot day before it's created. */
export type ProposedDayRecord = Omit<ShootDay, "id">;

export interface SchedulePublication {
  id: string;
  publishedAt: string;
  publishedBy: string;
  version: number;
  changes: {
    sceneId: string;
    fromDay?: number;
    toDay?: number;
    reason?: string;
  }[];
}

// ============================================================
// CAST & DOOD
// ============================================================

export type DoodStatus = "W" | "H" | "SW" | "WF" | "SWF" | "T" | "OFF";
// W=Work, H=Hold, SW=Start Work, WF=Work Finish, SWF=Start Work Finish, T=Travel, OFF=Off

export interface CastMember {
  id: string;
  name: string;
  role: string; // character name
  category: "lead" | "supporting" | "day_player";
  scenes: string[]; // scene IDs
  ratePerDay: number;
  agent?: string;
  contact?: string;
}

export type DoodMatrix = Record<string, Record<number, DoodStatus>>;
// castId -> shootDay -> status

// ============================================================
// TASKS
// ============================================================

export type TaskStatus =
  | "not_started"
  | "in_progress"
  | "review"
  | "completed"
  | "blocked";

export type TaskPriority = "low" | "medium" | "high" | "critical";

// Deadline expressions:
//   shoot_day(42) - 3d
//   shoot_day(42) + 1d
//   location_lock(LOC_A) + 2d
//   manual(2026-02-15)
export type DeadlineRule = string;

export interface Task {
  id: string;
  title: string;
  description?: string;
  owner: string; // crew member id
  department: DepartmentId;
  linkedScene?: string;
  linkedShootDay?: number;
  linkedShotId?: string;
  deadlineRule: DeadlineRule;
  computedDeadline: string; // ISO
  status: TaskStatus;
  blockedBy?: string[];
  priority: TaskPriority;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdByAI?: boolean;
}

/** A task before it's created — what `createTask` accepts. */
export type ProposedTaskRecord = Omit<Task, "id" | "createdAt" | "updatedAt">;

// ============================================================
// BUDGET & ACCOUNTING
// ============================================================

export interface BudgetLine {
  id: string;
  code: string; // e.g. "1100"
  category: string; // e.g. "Above the Line"
  subcategory?: string;
  department?: DepartmentId;
  description: string;
  budgeted: number;
  committed: number;
  spent: number;
}

export type POStatus =
  | "draft"
  | "submitted"
  | "accountant_review"
  | "admin_approval"
  | "approved"
  | "rejected";

export interface PurchaseOrder {
  id: string;
  number: string;
  vendor: string;
  description: string;
  amount: number;
  currency: string;
  accountCode: string;
  department: DepartmentId;
  linkedScene?: string;
  linkedShootDay?: number;
  requestedBy: string;
  requestedAt: string;
  status: POStatus;
  approvals: {
    step: "accountant" | "admin";
    by: string;
    at: string;
    decision: "approved" | "rejected";
    note?: string;
  }[];
  auditLog: { at: string; by: string; action: string }[];
}

export interface PettyCashEntry {
  id: string;
  date: string;
  amount: number;
  currency: string;
  description: string;
  department: DepartmentId;
  receiptFileId?: string;
  loggedBy: string;
}

// ============================================================
// VFX
// ============================================================

export type VFXShotStatus =
  | "bid"
  | "awarded"
  | "in_progress"
  | "internal_review"
  | "client_review"
  | "final"
  | "delivered";

export type VFXComplexity = "simple" | "moderate" | "complex";

export interface VFXVendor {
  id: string;
  name: string;
  contact: string;
  city: string;
  assignedShots: string[];
  onTimePercent: number;
}

export interface VFXShot {
  id: string;
  shotNumber: string; // e.g. "042_010"
  sceneId: string;
  description: string;
  complexity: VFXComplexity;
  status: VFXShotStatus;
  vendorId?: string;
  reviewRounds: number;
  reviewsCompleted: number;
  plateDeliveryDate?: string;
  finalDueDate?: string;
  thumbnail?: string; // color hint
}

// ============================================================
// RF / COMMS
// ============================================================

export interface FrequencyPlanEntry {
  id: string;
  shootDay: number;
  location: string;
  device: string; // e.g. "Wireless mic A"
  frequencyMHz: number;
  powerMW: number;
  channel: string;
  notes?: string;
}

export interface RFEquipment {
  id: string;
  type: string; // e.g. "Wireless TX", "IFB", "Video TX"
  model: string;
  serial: string;
  status: "available" | "assigned" | "maintenance";
  assignedShootDay?: number;
}

// ============================================================
// CAMERA / TECHNICAL
// ============================================================

export interface CameraKit {
  id: string;
  name: string; // e.g. "A-Cam Alexa + Zooms"
  items: string[]; // free text lines
  assignedShootDay?: number;
}

export interface EquipmentCheckoutEntry {
  id: string;
  item: string;
  checkedOutBy: string;
  checkoutAt: string;
  returnAt?: string;
  condition?: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  doneAt?: string;
  doneBy?: string;
}

export interface Checklist {
  id: string;
  title: string;
  shootDay?: number;
  items: ChecklistItem[];
}

// ============================================================
// ART / WARDROBE / PROPS
// ============================================================

export type ArtElementStatus =
  | "needed"
  | "sourced"
  | "in_progress"
  | "fitting"
  | "ready";

export interface ArtElement {
  id: string;
  name: string;
  category: "wardrobe" | "prop" | "set_dressing" | "makeup";
  sceneIds: string[];
  characterName?: string;
  status: ArtElementStatus;
  cost?: number;
  notes?: string;
  referenceImageIds?: string[];
}

export interface ContinuityPhoto {
  id: string;
  sceneId: string;
  fileId: string;
  caption?: string;
  takenAt: string;
}

// ============================================================
// FILES
// ============================================================

export interface FileEntry {
  id: string;
  name: string;
  ext: string;
  size: number; // bytes
  department: DepartmentId;
  scene?: string;
  shootDay?: number;
  uploadedBy: string;
  uploadedAt: string;
  tags?: string[];
  // Prototype: no actual data. Optional data-URL preview.
  preview?: string;
}

// ============================================================
// TIMESHEET
// ============================================================

export interface TimesheetEntry {
  id: string;
  crewMemberId: string;
  date: string; // ISO date (day)
  hours: number;
  submitted: boolean;
  submittedAt?: string;
  edits: {
    at: string;
    by: string;
    fromHours: number;
    toHours: number;
    isAdminOverride?: boolean;
  }[];
}

export interface OTRules {
  dailyOTAfter: number; // hours
  dailyDoubleTimeAfter: number;
  weeklyOTAfter: number;
  otMultiplier: number;
  doubleTimeMultiplier: number;
}

// ============================================================
// NOTIFICATIONS
// ============================================================

export type NotificationType =
  | "schedule_change"
  | "deadline_shifted"
  | "task_assigned"
  | "task_overdue"
  | "approval_requested"
  | "approval_decided"
  | "ai_digest";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  linkTo?: string; // route
  forRoles?: RoleId[];
}

// ============================================================
// ACTIVITY LOG — who did what, when
// ============================================================

export type ActivityEntity =
  | "task"
  | "cast"
  | "crew"
  | "user"
  | "role"
  | "timesheet"
  | "dood"
  | "scene"
  | "shoot_day"
  | "schedule"
  | "purchase_order"
  | "auth"
  | "project"
  | "art_element"
  | "location"
  | "vfx_shot"
  | "frequency"
  | "rf_equipment";

export interface ActivityLogEntry {
  id: string;
  at: string;                 // ISO
  userId: string;             // User.id (or "" for system)
  userLabel: string;          // cached display name
  action: string;             // "created", "updated", "deleted", "status_change", …
  entity: ActivityEntity;
  entityId?: string;
  description: string;        // human-readable one-liner
  meta?: Record<string, unknown>;
}

// ============================================================
// AI / CLAUDE USAGE
// ============================================================

export type AIFeature =
  | "script_breakdown"
  | "character_bible"
  | "daily_digest"
  | "report_narration"
  | "nl_query"
  | "task_proposals"
  | "location_bible"
  | "schedule_draft";

export interface AIUsageEntry {
  id: string;
  feature: AIFeature;
  at: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  costUsd: number;
}

/**
 * Provider, model and key are compiled into `lib/claude.ts` and are not user
 * config, so what's left here is the usage budget.
 */
export interface AIConfig {
  dailyBudgetTokens?: number;
  weeklyBudgetTokens?: number;
  monthlyBudgetTokens?: number;
  alertThresholdPct: number;
}

// ============================================================
// APPROVAL QUEUE ITEM
// ============================================================

export interface ApprovalItem {
  id: string;
  kind: "po" | "schedule_change" | "deadline_extension";
  requester: string;
  amount?: number;
  currency?: string;
  description: string;
  submittedAt: string;
  refId: string; // pointer to underlying record
}

// ============================================================
// PRODUCTION META
// ============================================================

export interface ProductionMeta {
  id: string;
  title: string;
  currency: string;
  budget: number;
  totalShootDays: number;
  currentShootDay: number;
  plannedPagesPerDay: number;
  script: {
    totalPages: number;
    totalScenes: number;
  };
}

// ============================================================
// PROJECTS
// ============================================================

export interface ProjectScript {
  fileName?: string;
  rawText: string;
  uploadedAt: string;
  pageCount?: number;
  source: "pdf" | "paste";
}

/** Lightweight project summary kept in the projects list. */
export interface Project {
  id: string;
  name: string;
  logline?: string;
  createdAt: string;
  updatedAt: string;
  currency: string;
  script?: ProjectScript;
  sceneCount: number;
  elementCount: number;
}

/**
 * The full working dataset for a single production. The active project's
 * data lives at the top level of the store; inactive projects are kept as
 * snapshots of this shape.
 */
export interface PublishedSchedule {
  version: number;
  publishedAt?: string;
  lastChanges: { sceneId: string; fromDay: number; toDay: number }[];
}

/** Cached output of the daily-digest AI pass, keyed by a hash of its inputs. */
export interface AIDigest {
  at: string;
  text: string;
  /** Hash of the production numbers the digest was written from. */
  hash: string;
  model: string;
}

/** One daily snapshot of production health, appended once per day. */
export interface HealthSnapshot {
  date: string; // YYYY-MM-DD
  health: number; // 0-100
}

export interface ProductionData {
  production: ProductionMeta;
  crew: CrewMember[];
  cast: CastMember[];
  scenes: Scene[];
  /** Characters the AI identified in the script, kept for cast + re-runs. */
  characterBible: ScriptCharacter[];
  locations: ProductionLocation[];
  shootDays: ShootDay[];
  dood: DoodMatrix;
  publishedSchedule: PublishedSchedule;
  /** Legacy lock dates. `locations[].lockDate` supersedes this; kept so old data resolves. */
  locationLockDates: Record<string, string>;
  tasks: Task[];
  budgetLines: BudgetLine[];
  purchaseOrders: PurchaseOrder[];
  pettyCash: PettyCashEntry[];
  vfxShots: VFXShot[];
  vfxVendors: VFXVendor[];
  frequencyPlan: FrequencyPlanEntry[];
  rfEquipment: RFEquipment[];
  cameraKits: CameraKit[];
  equipmentCheckouts: EquipmentCheckoutEntry[];
  checklists: Checklist[];
  artElements: ArtElement[];
  continuityPhotos: ContinuityPhoto[];
  timesheet: TimesheetEntry[];
  notifications: AppNotification[];
  activityLog: ActivityLogEntry[];
  aiDigest?: AIDigest;
  healthHistory: HealthSnapshot[];
}

// ============================================================
// AI PROVIDER CONFIG (extends AIConfig usage)
// ============================================================

export interface AIProviderConfig {
  hasKey: boolean;
  model: string;
}
