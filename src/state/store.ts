import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { SCHEMAS, type RecordCollection } from "@/data/schemas";
import type {
  RoleId,
  Role,
  User,
  Scene,
  ShootDay,
  Task,
  CrewMember,
  CastMember,
  BudgetLine,
  PurchaseOrder,
  PettyCashEntry,
  VFXShot,
  VFXVendor,
  FrequencyPlanEntry,
  RFEquipment,
  CameraKit,
  EquipmentCheckoutEntry,
  Checklist,
  ArtElement,
  ContinuityPhoto,
  TimesheetEntry,
  AppNotification,
  AIUsageEntry,
  AIConfig,
  AIJobState,
  ProductionMeta,
  ProductionData,
  ProductionLocation,
  ScriptCharacter,
  AIDigest,
  Project,
  ProjectScript,
  PublishedSchedule,
  DoodMatrix,
  DoodStatus,
  POStatus,
  TaskStatus,
  BreakdownElement,
  ActivityLogEntry,
  ActivityEntity,
  PermissionLevel,
  RolePermissions,
} from "@/types";
import { isAdminRole, permissionFor, accessFromPermissions } from "@/types";
import { DEFAULT_ROLES } from "@/data/roles";
import { evaluateDeadline } from "@/lib/deadlines";
import { resolveLockDates, locKey } from "@/lib/locations";
import { id, verifyPassword, hashPassword, HASH_PREFIX } from "@/lib/utils";
import {
  cloudEnabled,
  cloudConnect,
  bootstrapWorkspace,
  cloudDisconnect,
  pullWorkspace,
  startCloudSync,
  reconcile,
  registerRehydrate,
} from "@/lib/cloud";
import { pushToast } from "@/lib/toast";
import { navigateTo } from "@/lib/nav";
import {
  runBreakdown,
  retryBreakdownScenes,
  classifyAIFailure,
  type BreakdownProgress,
} from "@/lib/script";
import type { ProposedLocation, ScriptCharacter as ScriptChar } from "@/lib/claude";

/** One scene's extracted elements, as fed to the breakdown theater. */
export interface BreakdownSceneResult {
  elements: BreakdownElement[];
  /** True when this scene used the offline heuristic (worth retrying live). */
  fallback: boolean;
}

/**
 * The live script-breakdown run, hoisted out of the Projects modal so it keeps
 * running — and stays reviewable/retryable — after the dialog is closed or the
 * user navigates away. Transient (never persisted).
 */
export interface BreakdownRunState {
  projectId: string;
  projectName?: string;
  /** Parsed scenes, for the theater grid and for retrying by id. */
  scenes: Scene[];
  results: Record<string, BreakdownSceneResult>;
  progress: BreakdownProgress | null;
  status: "running" | "done" | "error";
  startedAt: number;
  runSeconds: number;
  /** True while a retry-the-missing-scenes pass is in flight. */
  retrying: boolean;
  // Source metadata, committed to the project's script record on completion.
  source: "pdf" | "paste";
  fileName?: string;
  rawText: string;
  pageCount?: number;
  // Completion payload (proposals to review, plus diagnostics).
  characters: ScriptChar[];
  locations: ProposedLocation[];
  failedScenes: { sceneNumber: string; error: string }[];
  usedDemo: boolean;
  error?: string;
  /**
   * When the provider is rate-limited/out of allowance, the epoch-ms after
   * which a retry is worth attempting. Drives the "try again in Xs" countdown.
   */
  cooldownUntil?: number;
  /** Kind of pause, for the message + whether auto-retry makes sense. */
  cooldownKind?: "rate" | "allowance";
  /** Auto-fire the retry the moment the cooldown elapses. */
  autoRetry: boolean;
}

/**
 * `access` is what every page guard reads, so it is never authored directly —
 * it is recomputed from `permissions` on every write. An admin role short-
 * circuits to ["all"] and drops its map: "all" already means write everywhere.
 */
function withDerivedAccess<T extends { access: string[]; permissions?: RolePermissions }>(
  role: T
): T {
  if (role.access.includes("all")) {
    const { permissions: _drop, ...rest } = role;
    return { ...rest, access: ["all"] } as T;
  }
  if (!role.permissions) return role;
  return { ...role, access: accessFromPermissions(role.permissions) };
}

// ============================================================
// CLOUD SESSION
//
// Signing into SceneTrackable is the only sign-in there is: the cloud
// session is derived from the same username + password and established
// here, so no one has to know Supabase exists. All of this is a no-op when
// the app was built without Supabase credentials.
// ============================================================

/** Attach this device to the shared workspace and start syncing. */
async function attachCloud(
  username: string,
  passwordHash: string,
  gateSecret?: string,
  isInvite = false
): Promise<void> {
  if (!cloudEnabled) return;
  const res = await cloudConnect({ username, passwordHash, gateSecret, isInvite });
  if (res.needsBootstrap) {
    // Fresh deployment with no workspace yet — this device's data becomes it.
    const boot = await bootstrapWorkspace(username);
    if (!boot.ok) return;
  } else if (!res.ok) {
    return;
  }
  startCloudSync();
  await reconcile();
}

/**
 * Recover an account on a device that has never seen it.
 *
 * A brand-new browser starts blank, so the local user list can't authorize
 * anyone — but the cloud can. The derived credential only signs in if this
 * username/password already exists in the workspace, so a successful pull is
 * itself the proof; the normal local login then runs against the pulled data.
 * Returns null on success, or a message explaining why it couldn't.
 */
export async function cloudRecoverAccount(
  username: string,
  password: string,
  opts?: { inviteCode?: string }
): Promise<string | null> {
  if (!cloudEnabled) return "Invalid username or password.";
  const passwordHash = await hashPassword(password);
  const res = await cloudConnect({
    username,
    passwordHash,
    gateSecret: opts?.inviteCode ?? passwordHash,
    isInvite: Boolean(opts?.inviteCode),
  });
  if (!res.ok) return res.error ?? "Invalid username or password.";
  const err = await pullWorkspace();
  if (err) return err;
  startCloudSync();
  return null;
}

// ============================================================
// BLANK DATA HELPERS
// ============================================================

export function blankMeta(title: string, currency = "AED"): ProductionMeta {
  return {
    id: id("prod"),
    title,
    currency,
    budget: 0,
    totalShootDays: 0,
    currentShootDay: 0,
    plannedPagesPerDay: 0,
    script: { totalPages: 0, totalScenes: 0 },
  };
}

const BLANK_PUBLISHED: PublishedSchedule = { version: 1, lastChanges: [] };

export function blankData(title: string, currency = "AED"): ProductionData {
  return {
    production: blankMeta(title, currency),
    crew: [],
    cast: [],
    scenes: [],
    characterBible: [],
    locations: [],
    shootDays: [],
    dood: {},
    publishedSchedule: { ...BLANK_PUBLISHED },
    locationLockDates: {},
    tasks: [],
    budgetLines: [],
    purchaseOrders: [],
    pettyCash: [],
    vfxShots: [],
    vfxVendors: [],
    frequencyPlan: [],
    rfEquipment: [],
    cameraKits: [],
    drones: [],
    equipmentCheckouts: [],
    checklists: [],
    artElements: [],
    continuityPhotos: [],
    timesheet: [],
    notifications: [],
    activityLog: [],
    // Explicitly present so DATA_KEYS covers it and project switches carry it.
    aiDigest: undefined,
    healthHistory: [],
  };
}

/** Field names that make up the active-project working set. */
const DATA_KEYS = Object.keys(blankData("")) as (keyof ProductionData)[];

/**
 * The context every deadline rule is evaluated against. Always build it from
 * here — location lock dates live in two places (records + the legacy map) and
 * this is the only spot that knows how they merge.
 */
function scheduleContext(state: State) {
  return {
    shootDays: state.shootDays,
    locationLockDates: resolveLockDates(state.locations, state.locationLockDates),
  };
}

function captureActive(state: State): ProductionData {
  const out = {} as ProductionData;
  for (const k of DATA_KEYS) {
    // @ts-expect-error dynamic copy across matching keys
    out[k] = state[k];
  }
  return out;
}

/**
 * Turn a pre-v2 dataset's `locationLockDates` into `ProductionLocation`
 * records, in place. The legacy map is left untouched: it stays the fallback
 * for anything this misses, and `resolveLockDates` lets the records win.
 */
function adoptLegacyLocations(data: Record<string, any> | undefined): void {
  if (!data || typeof data !== "object") return;
  const legacy: Record<string, string> = data.locationLockDates ?? {};
  const existing: ProductionLocation[] = Array.isArray(data.locations) ? data.locations : [];
  const known = new Set(existing.map((l) => locKey(l.name)));

  // A scene heading is the only clue we have to whether a place is interior.
  const scenes: { location?: string; intExt?: string }[] = Array.isArray(data.scenes)
    ? data.scenes
    : [];
  const typeOf = (name: string): ProductionLocation["type"] => {
    const hit = scenes.find((s) => locKey(s.location ?? "") === locKey(name));
    const t = hit?.intExt;
    return t === "INT" || t === "EXT" || t === "INT/EXT" ? t : "INT";
  };

  const added: ProductionLocation[] = [];
  for (const [name, lockDate] of Object.entries(legacy)) {
    if (!name.trim() || known.has(locKey(name))) continue;
    known.add(locKey(name));
    added.push({
      id: id("loc"),
      name: name.trim(),
      type: typeOf(name),
      permitStatus: lockDate ? "locked" : "scouting",
      lockDate: lockDate || undefined,
    });
  }
  data.locations = [...existing, ...added];
  if (!Array.isArray(data.characterBible)) data.characterBible = [];
  if (!Array.isArray(data.healthHistory)) data.healthHistory = [];
}

// ============================================================
// SEED — a single master admin account, blank everything else
// ============================================================

const MASTER_ADMIN: User = {
  id: "user_admin",
  username: "Admin",
  displayName: "Administrator",
  password: "1234",
  roleId: "admin",
  active: true,
  createdAt: new Date().toISOString(),
};

// ============================================================
// STORE SHAPE
// ============================================================

interface State extends ProductionData {
  // ---- Auth / session ----
  users: User[];
  roles: Role[];
  currentUserId: string; // "" when logged out
  activeRole: RoleId | null; // active viewing role (admin can "view as")
  tutorialSeen: boolean;

  /** Guided-tour progress. `running` drives the spotlight overlay. */
  tour: { running: boolean; stepIndex: number; completed: string[] };

  // ---- UI preferences ----
  /** Sidebar stays expanded instead of only widening on hover. */
  sidebarPinned: boolean;

  // ---- Projects ----
  projects: Project[];
  activeProjectId: string | null;
  projectData: Record<string, ProductionData>;

  // ---- Global AI ----
  aiUsage: AIUsageEntry[];
  aiConfig: AIConfig;
  /**
   * Background AI job state, keyed by job id (usually an AIFeature). Transient:
   * excluded from persistence so an interrupted run reloads as resumable, not
   * running. See the E1 job actions below.
   */
  aiJobs: Record<string, AIJobState>;
  /**
   * The live script-breakdown run. Lifted out of the Projects modal so the run
   * keeps going — and stays reviewable — after the user closes the dialog or
   * navigates away. Transient (stripped from persistence, like `aiJobs`).
   */
  breakdownRun: BreakdownRunState | null;

  // ------------------------------------------------------------
  // Auth actions
  // ------------------------------------------------------------
  login: (username: string, password: string) => Promise<boolean>;
  /** True when this account is holding an invite code, so the UI can prompt them to set a password. */
  isInvitePending: (username: string) => boolean;
  /** First-login flow: user redeems their invite code + sets a real password. */
  redeemInvite: (username: string, inviteCode: string, newPassword: string) => Promise<string | null>;
  logout: () => void;
  addUser: (u: Omit<User, "id" | "createdAt">) => void;
  /** Admin invites a user; a one-time code is generated and stored on the User record. */
  inviteUser: (u: { displayName: string; username: string; roleId: string }) => string;
  updateUser: (id: string, patch: Partial<User>) => void;
  /** Admin action: reset a user back to invite-code mode (regenerates the code). */
  resetUserInvite: (id: string) => string | null;
  removeUser: (id: string) => void;

  // Roles
  addRole: (r: Omit<Role, "id">) => void;
  updateRole: (id: string, patch: Partial<Role>) => string | null; // error message or null
  removeRole: (id: string) => string | null; // returns error message or null

  setActiveRole: (role: RoleId | null) => void;
  markTutorialSeen: () => void;
  startTour: () => void;
  stopTour: () => void;
  setTourStep: (i: number) => void;
  completeTourStep: (id: string) => void;
  setSidebarPinned: (pinned: boolean) => void;

  // ------------------------------------------------------------
  // Project actions
  // ------------------------------------------------------------
  createProject: (name: string, currency?: string) => string;
  switchProject: (id: string) => void;
  renameProject: (id: string, name: string, logline?: string) => void;
  deleteProject: (id: string) => void;
  setProjectScript: (script: ProjectScript) => void;
  replaceScenes: (scenes: Scene[]) => void;

  // ------------------------------------------------------------
  // Production actions (operate on the active project)
  // ------------------------------------------------------------
  updateScene: (id: string, patch: Partial<Scene>) => void;
  addScene: (scene: Scene) => void;
  removeScene: (id: string) => void;
  addElementToScene: (sceneId: string, name: string, category: BreakdownElement["category"]) => void;
  removeElementFromScene: (sceneId: string, elementId: string) => void;
  updateElement: (sceneId: string, elementId: string, patch: Partial<BreakdownElement>) => void;
  mergeAIProposalIntoScene: (
    sceneId: string,
    accepted: Omit<BreakdownElement, "id">[]
  ) => void;

  moveSceneToDay: (sceneId: string, toDay: number, indexInDay?: number) => void;
  publishSchedule: () => void;
  recomputeAllDeadlines: () => void;
  /** Records a lock date against a location by name. */
  setLocationLock: (locationName: string, date: string) => void;
  /** Replaces the persisted character bible after a breakdown run. */
  setCharacterBible: (characters: ScriptCharacter[]) => void;
  /** Caches the daily digest so it isn't regenerated on every dashboard visit. */
  setAIDigest: (digest: AIDigest) => void;
  /** Appends today's health score, once per day. */
  recordHealth: (health: number) => void;

  cycleDoodCell: (castId: string, day: number) => void;
  /**
   * Fills the DOOD matrix from the schedule: W on days holding one of a cast
   * member's scenes, H on the gaps between their first and last day. Never
   * overwrites a cell someone already set. Returns cells filled.
   */
  seedDoodFromSchedule: () => number;

  createTask: (task: Omit<Task, "id" | "createdAt" | "updatedAt" | "computedDeadline"> & { computedDeadline?: string }) => void;
  updateTaskStatus: (id: string, status: TaskStatus) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;

  submitPO: (po: Omit<PurchaseOrder, "id" | "requestedAt" | "status" | "approvals" | "auditLog" | "number">) => void;
  advancePO: (id: string, decision: "approve" | "reject", byUserId: string, note?: string) => void;
  addPettyCash: (entry: Omit<PettyCashEntry, "id">) => void;
  /**
   * Land a parsed budget file on the top sheet. "replace" swaps the whole
   * sheet, "append" adds to it; `currency` is written to the production when
   * the file named one, so the numbers display in the money they were budgeted
   * in rather than the workspace default.
   */
  importBudgetLines: (
    lines: BudgetLine[],
    mode: "replace" | "append",
    meta?: { fileName?: string; currency?: string }
  ) => void;

  updateShotStatus: (id: string, status: VFXShot["status"]) => void;
  assignShotVendor: (shotId: string, vendorId: string) => void;

  editTimesheetHours: (entryId: string, newHours: number, byUserId: string, isAdmin: boolean) => void;
  submitTimesheetForCrew: (crewMemberId: string) => void;

  markNotificationRead: (id: string) => void;
  markAllRead: () => void;
  addNotification: (n: Omit<AppNotification, "id" | "createdAt" | "read">) => void;

  // ---- Cast ----
  addCastMember: (c: Omit<CastMember, "id">) => void;
  updateCastMember: (id: string, patch: Partial<CastMember>) => void;
  removeCastMember: (id: string) => void;
  setDoodStatus: (castId: string, day: number, status: DoodStatus) => void;

  // ---- Crew ----
  addCrewMember: (c: Omit<CrewMember, "id">) => void;
  updateCrewMember: (id: string, patch: Partial<CrewMember>) => void;
  removeCrewMember: (id: string) => void;

  // ---- Timesheet ----
  addTimesheetEntry: (e: Omit<TimesheetEntry, "id" | "edits" | "submitted" | "submittedAt">) => void;

  // ---- Activity log ----
  logActivity: (
    entry: Omit<ActivityLogEntry, "id" | "at" | "userId" | "userLabel">
  ) => void;
  clearActivityLog: () => void;

  recordAIUsage: (entry: Omit<AIUsageEntry, "id" | "at">) => void;
  setAIConfig: (patch: Partial<AIConfig>) => void;

  // ---- AI background jobs (E1) ----
  aiJobBegin: (key: string, opts: { label: string; total: number; route?: string }) => void;
  aiJobProgress: (key: string, done: number, total?: number) => void;
  aiJobPauseLimit: (key: string, error: string) => void;
  aiJobDone: (key: string) => void;
  aiJobFail: (key: string, error: string) => void;
  aiJobReset: (key: string) => void;

  // ---- Background script breakdown ----
  /** Kick off a full breakdown that survives closing the dialog / navigation. */
  startBreakdownRun: (input: {
    projectId: string;
    projectName?: string;
    scenes: Scene[];
    source: "pdf" | "paste";
    fileName?: string;
    rawText: string;
    pageCount?: number;
  }) => Promise<void>;
  /** Re-run only the scenes that fell back to the offline heuristic. */
  retryBreakdownScenes: () => Promise<void>;
  /** Toggle auto-retry-on-cooldown-elapse for the current run. */
  setBreakdownAutoRetry: (on: boolean) => void;
  /** Discard the run once the user has reviewed (or dismissed) it. */
  clearBreakdownRun: () => void;

  toggleChecklistItem: (checklistId: string, itemId: string, byUserId: string) => void;
  assignRFEquipmentToDay: (equipmentId: string, day: number | null) => void;
  assignKitToDay: (kitId: string, day: number | null) => void;
  updateArtElementStatus: (id: string, status: ArtElement["status"]) => void;

  // ---- Generic record CRUD (schema-driven, see src/data/schemas.ts) ----
  addRecord: (collection: RecordCollection, values: Record<string, unknown>) => string;
  updateRecord: (
    collection: RecordCollection,
    id: string,
    values: Record<string, unknown>
  ) => void;
  deleteRecord: (collection: RecordCollection, id: string) => void;
}

// ============================================================
// STORE
// ============================================================

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      // ---- Blank active dataset ----
      ...blankData("SceneTrackable"),

      // ---- Auth ----
      users: [MASTER_ADMIN],
      roles: DEFAULT_ROLES,
      currentUserId: "",
      activeRole: null,
      tutorialSeen: false,
      tour: { running: false, stepIndex: 0, completed: [] },

      // ---- UI ----
      sidebarPinned: false,

      // ---- Projects ----
      projects: [],
      activeProjectId: null,
      projectData: {},

      // ---- AI ----
      aiUsage: [],
      aiConfig: { alertThresholdPct: 80 },
      aiJobs: {},
      breakdownRun: null,

      // ========================================================
      // AUTH
      // ========================================================
      login: async (username, password) => {
        const user = get().users.find(
          (u) => u.active && u.username.toLowerCase() === username.trim().toLowerCase()
        );
        if (!user) return false;
        // Invite-pending accounts can't log in with a password until they redeem their code.
        if (user.inviteCode && !user.password) return false;
        if (!(await verifyPassword(user.password, password))) return false;
        // Transparently upgrade legacy plaintext records to hashed storage.
        if (!user.password.startsWith(HASH_PREFIX)) {
          const hashed = await hashPassword(password);
          set((s) => ({
            users: s.users.map((u) => (u.id === user.id ? { ...u, password: hashed } : u)),
          }));
        }
        set({ currentUserId: user.id, activeRole: user.roleId });
        get().logActivity({
          action: "login",
          entity: "auth",
          description: `${user.displayName} signed in`,
        });
        // Not awaited: the cloud handshake is a few round trips and must not
        // hold the sign-in button hostage. Sync catches up on its own.
        void attachCloud(user.username, await hashPassword(password));
        return true;
      },

      isInvitePending: (username) => {
        const u = get().users.find(
          (u) => u.username.toLowerCase() === username.trim().toLowerCase()
        );
        return !!u && !!u.inviteCode && !u.password;
      },

      redeemInvite: async (username, inviteCode, newPassword) => {
        const user = get().users.find(
          (u) => u.active && u.username.toLowerCase() === username.trim().toLowerCase()
        );
        if (!user) return "Unknown username.";
        if (!user.inviteCode) return "This account is not pending an invite.";
        if (user.inviteCode.trim() !== inviteCode.trim()) return "Invite code doesn't match.";
        if (newPassword.length < 4) return "Choose a password of at least 4 characters.";
        const hashed = await hashPassword(newPassword);
        set((s) => ({
          users: s.users.map((u) =>
            u.id === user.id ? { ...u, password: hashed, inviteCode: undefined } : u
          ),
        }));
        // Sign them in first so logActivity attributes to this user.
        set({ currentUserId: user.id, activeRole: user.roleId });
        get().logActivity({
          action: "invite_redeemed",
          entity: "auth",
          description: `${user.displayName} set a password from invite`,
        });
        // The invite code is the gate here, not the password: the cloud copy
        // still has this account password-less, so a password-based join
        // would be rejected. Redeeming also revokes any older device identity
        // for this account, which is what makes an admin reset stick.
        void attachCloud(user.username, hashed, inviteCode.trim(), true);
        return null;
      },

      logout: () => {
        get().logActivity({
          action: "logout",
          entity: "auth",
          description: `Signed out`,
        });
        set({ currentUserId: "", activeRole: null });
        void cloudDisconnect();
      },

      addUser: (u) => {
        const newUser = { ...u, id: id("user"), createdAt: new Date().toISOString() };
        set((s) => ({ users: [...s.users, newUser] }));
        get().logActivity({
          action: "created",
          entity: "user",
          entityId: newUser.id,
          description: `Added user “${newUser.displayName}”`,
        });
      },

      inviteUser: ({ displayName, username, roleId }) => {
        const code = Math.random().toString(36).slice(2, 10).toUpperCase();
        const newUser: User = {
          id: id("user"),
          username: username.trim(),
          displayName: displayName.trim(),
          password: "",
          roleId,
          active: true,
          createdAt: new Date().toISOString(),
          inviteCode: code,
        };
        set((s) => ({ users: [...s.users, newUser] }));
        get().logActivity({
          action: "invited",
          entity: "user",
          entityId: newUser.id,
          description: `Invited “${newUser.displayName}” (${newUser.username})`,
        });
        return code;
      },

      updateUser: (uid, patch) => {
        set((s) => ({
          users: s.users.map((u) => (u.id === uid ? { ...u, ...patch } : u)),
        }));
        const u = get().users.find((x) => x.id === uid);
        get().logActivity({
          action: "updated",
          entity: "user",
          entityId: uid,
          description: `Updated user “${u?.displayName ?? uid}”`,
          meta: { fields: Object.keys(patch) },
        });
      },

      resetUserInvite: (uid) => {
        const target = get().users.find((u) => u.id === uid);
        if (!target) return null;
        const code = Math.random().toString(36).slice(2, 10).toUpperCase();
        set((s) => ({
          users: s.users.map((u) =>
            u.id === uid ? { ...u, inviteCode: code, password: "" } : u
          ),
        }));
        get().logActivity({
          action: "invite_reset",
          entity: "user",
          entityId: uid,
          description: `Reset invite for “${target.displayName}”`,
        });
        return code;
      },

      removeUser: (uid) => {
        const target = get().users.find((u) => u.id === uid);
        set((s) => ({ users: s.users.filter((u) => u.id !== uid) }));
        get().logActivity({
          action: "deleted",
          entity: "user",
          entityId: uid,
          description: `Removed user “${target?.displayName ?? uid}”`,
        });
      },

      // ---- Roles ----
      addRole: (r) => {
        const role = { ...withDerivedAccess(r), id: id("role") };
        set((s) => ({ roles: [...s.roles, role] }));
        get().logActivity({
          action: "created",
          entity: "role",
          entityId: role.id,
          description: `Created role “${role.label}”`,
        });
      },

      updateRole: (rid, patch) => {
        const state = get();
        const before = state.roles.find((r) => r.id === rid);
        if (!before) return "Role not found.";
        const next = withDerivedAccess({ ...before, ...patch, id: before.id });

        // Dropping the last admin role would leave nobody able to hand it
        // back — there is no way to reach this console without one.
        if (isAdminRole(before) && !isAdminRole(next)) {
          const otherAdminRoles = state.roles.filter(
            (r) => r.id !== rid && isAdminRole(r)
          );
          const covered = otherAdminRoles.some((r) =>
            state.users.some((u) => u.roleId === r.id && u.active)
          );
          if (!covered)
            return "This is the only role with administrator access. Give another role admin access first.";
        }

        set((s) => ({ roles: s.roles.map((r) => (r.id === rid ? next : r)) }));
        get().logActivity({
          action: "updated",
          entity: "role",
          entityId: rid,
          description: `Updated permissions for role “${next.label}”`,
        });
        return null;
      },

      removeRole: (rid) => {
        const state = get();
        const role = state.roles.find((r) => r.id === rid);
        if (!role) return "Role not found.";
        if (role.builtIn) return "Built-in roles cannot be deleted.";
        if (state.users.some((u) => u.roleId === rid))
          return "Reassign users on this role before deleting it.";
        set({ roles: state.roles.filter((r) => r.id !== rid) });
        get().logActivity({
          action: "deleted",
          entity: "role",
          entityId: rid,
          description: `Deleted role “${role.label}”`,
        });
        return null;
      },

      setActiveRole: (role) => set({ activeRole: role }),
      markTutorialSeen: () => set({ tutorialSeen: true }),
      startTour: () =>
        set((s) => ({ tour: { ...s.tour, running: true, stepIndex: 0 } })),
      stopTour: () => set((s) => ({ tour: { ...s.tour, running: false } })),
      setTourStep: (i) => set((s) => ({ tour: { ...s.tour, stepIndex: Math.max(0, i) } })),
      completeTourStep: (id) =>
        set((s) => ({
          tour: {
            ...s.tour,
            completed: s.tour.completed.includes(id)
              ? s.tour.completed
              : [...s.tour.completed, id],
          },
        })),
      setSidebarPinned: (pinned) => set({ sidebarPinned: pinned }),

      // ========================================================
      // PROJECTS
      // ========================================================
      createProject: (name, currency = "AED") => {
        const state = get();
        const projectData = { ...state.projectData };
        if (state.activeProjectId) {
          projectData[state.activeProjectId] = captureActive(state);
        }
        const now = new Date().toISOString();
        const pid = id("proj");
        const data = blankData(name, currency);
        const summary: Project = {
          id: pid,
          name,
          createdAt: now,
          updatedAt: now,
          currency,
          sceneCount: 0,
          elementCount: 0,
        };
        set({
          ...data,
          projectData,
          projects: [summary, ...state.projects],
          activeProjectId: pid,
        });
        return pid;
      },

      switchProject: (pid) => {
        const state = get();
        if (pid === state.activeProjectId) return;
        const projectData = { ...state.projectData };
        if (state.activeProjectId) {
          projectData[state.activeProjectId] = captureActive(state);
        }
        const name = state.projects.find((p) => p.id === pid)?.name ?? "Project";
        // Spread over a blank set, not over the outgoing project: a snapshot
        // taken before a collection existed has no key for it, and a bare
        // spread would leave the previous project's rows sitting in it.
        const target = { ...blankData(name), ...(projectData[pid] ?? {}) };
        set({ ...target, projectData, activeProjectId: pid });
      },

      renameProject: (pid, name, logline) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === pid ? { ...p, name, logline, updatedAt: new Date().toISOString() } : p
          ),
          production:
            pid === s.activeProjectId ? { ...s.production, title: name } : s.production,
        })),

      deleteProject: (pid) => {
        const state = get();
        const projectData = { ...state.projectData };
        delete projectData[pid];
        const projects = state.projects.filter((p) => p.id !== pid);
        if (pid === state.activeProjectId) {
          const next = projects[0];
          if (next) {
            const target = { ...blankData(next.name), ...(projectData[next.id] ?? {}) };
            set({ ...target, projectData, projects, activeProjectId: next.id });
          } else {
            set({
              ...blankData("SceneTrackable"),
              projectData,
              projects,
              activeProjectId: null,
            });
          }
        } else {
          set({ projectData, projects });
        }
      },

      setProjectScript: (script) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === s.activeProjectId
              ? { ...p, script, updatedAt: new Date().toISOString() }
              : p
          ),
        })),

      replaceScenes: (scenes) =>
        set((s) => {
          const elementCount = scenes.reduce((n, sc) => n + sc.elements.length, 0);
          const totalPages = scenes.reduce((n, sc) => n + sc.pages, 0);
          return {
            scenes,
            production: {
              ...s.production,
              script: { totalScenes: scenes.length, totalPages: Math.round(totalPages * 10) / 10 },
            },
            projects: s.projects.map((p) =>
              p.id === s.activeProjectId
                ? { ...p, sceneCount: scenes.length, elementCount, updatedAt: new Date().toISOString() }
                : p
            ),
          };
        }),

      // ========================================================
      // SCENES
      // ========================================================
      updateScene: (sid, patch) =>
        set((s) => ({
          scenes: s.scenes.map((sc) => (sc.id === sid ? { ...sc, ...patch } : sc)),
        })),

      addScene: (scene) => set((s) => ({ scenes: [...s.scenes, scene] })),

      removeScene: (sid) =>
        set((s) => ({ scenes: s.scenes.filter((sc) => sc.id !== sid) })),

      addElementToScene: (sceneId, name, category) =>
        set((s) => ({
          scenes: s.scenes.map((sc) =>
            sc.id === sceneId
              ? { ...sc, elements: [...sc.elements, { id: id("el"), name, category }] }
              : sc
          ),
        })),

      removeElementFromScene: (sceneId, elementId) =>
        set((s) => ({
          scenes: s.scenes.map((sc) =>
            sc.id === sceneId
              ? { ...sc, elements: sc.elements.filter((e) => e.id !== elementId) }
              : sc
          ),
        })),

      updateElement: (sceneId, elementId, patch) =>
        set((s) => ({
          scenes: s.scenes.map((sc) =>
            sc.id === sceneId
              ? {
                  ...sc,
                  elements: sc.elements.map((e) =>
                    e.id === elementId ? { ...e, ...patch } : e
                  ),
                }
              : sc
          ),
        })),

      mergeAIProposalIntoScene: (sceneId, accepted) =>
        set((s) => ({
          scenes: s.scenes.map((sc) =>
            sc.id === sceneId
              ? {
                  ...sc,
                  elements: [
                    ...sc.elements,
                    ...accepted.map((e) => ({ ...e, id: id("el") })),
                  ],
                }
              : sc
          ),
        })),

      // ========================================================
      // SCHEDULE
      // ========================================================
      moveSceneToDay: (sceneId, toDay, indexInDay) => {
        const state = get();
        const fromDayNum = state.shootDays.find((d) => d.scenes.includes(sceneId))?.dayNumber;
        if (fromDayNum === toDay) return;

        const newShootDays = state.shootDays.map((d) => {
          const isTo = d.dayNumber === toDay;
          let sceneList = d.scenes.filter((sid) => sid !== sceneId);
          if (isTo) {
            if (indexInDay === undefined || indexInDay >= sceneList.length) {
              sceneList = [...sceneList, sceneId];
            } else {
              sceneList = [
                ...sceneList.slice(0, indexInDay),
                sceneId,
                ...sceneList.slice(indexInDay),
              ];
            }
          }
          return { ...d, scenes: sceneList };
        });

        set({
          shootDays: newShootDays,
          publishedSchedule: {
            ...state.publishedSchedule,
            lastChanges: [
              ...state.publishedSchedule.lastChanges,
              { sceneId, fromDay: fromDayNum ?? 0, toDay },
            ],
          },
        });

        get().recomputeAllDeadlines();
        get().addNotification({
          type: "schedule_change",
          title: `Scene ${state.scenes.find((sc) => sc.id === sceneId)?.number} moved to Day ${toDay}`,
          body: `From Day ${fromDayNum ?? "?"}. Deadlines recomputed.`,
          linkTo: "/schedule",
        });
      },

      publishSchedule: () => {
        const state = get();
        set({
          publishedSchedule: {
            version: state.publishedSchedule.version + 1,
            publishedAt: new Date().toISOString(),
            lastChanges: [],
          },
        });
        get().addNotification({
          type: "schedule_change",
          title: `Schedule v${state.publishedSchedule.version + 1} published`,
          body: `${state.publishedSchedule.lastChanges.length} changes distributed to departments.`,
          linkTo: "/schedule",
        });
      },

      recomputeAllDeadlines: () => {
        const state = get();
        const ctx = scheduleContext(state);
        set({
          tasks: state.tasks.map((t) => {
            const nd = evaluateDeadline(t.deadlineRule, ctx);
            return nd ? { ...t, computedDeadline: nd, updatedAt: new Date().toISOString() } : t;
          }),
        });
      },

      /**
       * Sets a lock date by location name. Writes to the location record when
       * one exists — that's the source of truth — and only falls back to the
       * legacy map for a name no record covers.
       */
      setLocationLock: (locationName, date) => {
        const match = get().locations.find(
          (l) =>
            locKey(l.name) === locKey(locationName) ||
            (l.aliases ?? []).some((a) => locKey(a) === locKey(locationName))
        );
        if (match) {
          set((s) => ({
            locations: s.locations.map((l) =>
              l.id === match.id ? { ...l, lockDate: date } : l
            ),
          }));
          get().logActivity({
            action: "lock_date_set",
            entity: "location",
            entityId: match.id,
            description: `Locked ${match.name} on ${date.slice(0, 10)}`,
          });
        } else {
          set((s) => ({
            locationLockDates: { ...s.locationLockDates, [locationName]: date },
          }));
        }
        get().recomputeAllDeadlines();
      },

      setCharacterBible: (characters) => set({ characterBible: characters }),

      setAIDigest: (digest) => set({ aiDigest: digest }),

      recordHealth: (health) => {
        const today = new Date().toISOString().slice(0, 10);
        const history = get().healthHistory ?? [];
        if (history[history.length - 1]?.date === today) return;
        // 30 days is all the sparkline shows; keeping more just bloats storage.
        set({ healthHistory: [...history, { date: today, health }].slice(-30) });
      },

      // ---- DOOD ----
      cycleDoodCell: (castId, day) => {
        const cycle: DoodStatus[] = ["OFF", "H", "W", "SW", "WF", "SWF", "T"];
        set((s) => {
          const cur = s.dood[castId]?.[day] ?? "OFF";
          const idx = cycle.indexOf(cur);
          const next = cycle[(idx + 1) % cycle.length];
          return {
            dood: { ...s.dood, [castId]: { ...(s.dood[castId] ?? {}), [day]: next } },
          };
        });
      },

      // ---- Tasks ----
      createTask: (task) => {
        const s = get();
        const computed =
          task.computedDeadline ??
          evaluateDeadline(task.deadlineRule, scheduleContext(s)) ??
          new Date().toISOString();
        const nt: Task = {
          ...task,
          id: id("task"),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          computedDeadline: computed,
        };
        set((cur) => ({ tasks: [...cur.tasks, nt] }));
        get().logActivity({
          action: "created",
          entity: "task",
          entityId: nt.id,
          description: `Created task “${nt.title}”`,
          meta: { deadline: computed, owner: nt.owner },
        });
      },

      updateTaskStatus: (tid, status) => {
        const prev = get().tasks.find((t) => t.id === tid);
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === tid ? { ...t, status, updatedAt: new Date().toISOString() } : t
          ),
        }));
        get().logActivity({
          action: "status_change",
          entity: "task",
          entityId: tid,
          description: `${prev?.title ?? tid}: ${prev?.status ?? "?"} → ${status}`,
        });
      },

      updateTask: (tid, patch) => {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === tid ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
          ),
        }));
        const t = get().tasks.find((x) => x.id === tid);
        get().logActivity({
          action: "updated",
          entity: "task",
          entityId: tid,
          description: `Edited task “${t?.title ?? tid}”`,
          meta: { fields: Object.keys(patch) },
        });
      },

      deleteTask: (tid) => {
        const idx = get().tasks.findIndex((x) => x.id === tid);
        const t = get().tasks[idx];
        if (!t) return;
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== tid) }));
        get().logActivity({
          action: "deleted",
          entity: "task",
          entityId: tid,
          description: `Deleted task “${t.title}”`,
        });
        pushToast({
          title: "Task deleted",
          description: t.title,
          tone: "danger",
          action: {
            label: "Undo",
            run: () =>
              set((s) => {
                const arr = s.tasks.slice();
                arr.splice(Math.min(idx, arr.length), 0, t);
                return { tasks: arr };
              }),
          },
        });
      },

      // ---- POs ----
      submitPO: (po) =>
        set((s) => {
          const nextNumber = `PO-${(1001 + s.purchaseOrders.length).toString()}`;
          const newPO: PurchaseOrder = {
            ...po,
            id: id("po"),
            number: nextNumber,
            requestedAt: new Date().toISOString(),
            status: "submitted",
            approvals: [],
            auditLog: [{ at: new Date().toISOString(), by: po.requestedBy, action: "Submitted PO" }],
          };
          return { purchaseOrders: [newPO, ...s.purchaseOrders] };
        }),

      advancePO: (pid, decision, byUserId, note) =>
        set((s) => ({
          purchaseOrders: s.purchaseOrders.map((po) => {
            if (po.id !== pid) return po;
            const now = new Date().toISOString();
            const nextStatus: POStatus =
              decision === "reject"
                ? "rejected"
                : po.status === "submitted"
                ? "accountant_review"
                : po.status === "accountant_review"
                ? po.amount > 25_000
                  ? "admin_approval"
                  : "approved"
                : po.status === "admin_approval"
                ? "approved"
                : po.status;
            const approvalStep: "accountant" | "admin" =
              po.status === "accountant_review" ? "accountant" : "admin";
            return {
              ...po,
              status: nextStatus,
              approvals: [
                ...po.approvals,
                { step: approvalStep, by: byUserId, at: now, decision: decision === "approve" ? "approved" : "rejected", note },
              ],
              auditLog: [
                ...po.auditLog,
                { at: now, by: byUserId, action: `${decision === "approve" ? "Approved" : "Rejected"} (${approvalStep})` },
              ],
            };
          }),
        })),

      addPettyCash: (entry) =>
        set((s) => ({
          pettyCash: [{ ...entry, id: id("pc") }, ...s.pettyCash],
        })),

      importBudgetLines: (lines, mode, meta) => {
        const replaced = mode === "replace" ? get().budgetLines : [];
        set((s) => {
          const budgetLines = mode === "replace" ? lines : [...s.budgetLines, ...lines];
          return {
            budgetLines,
            // The top sheet is the production's budget, so the headline figure
            // follows it — otherwise the dashboard keeps reporting a number the
            // imported sheet no longer supports.
            production: {
              ...s.production,
              budget: budgetLines.reduce((sum, l) => sum + l.budgeted, 0),
              currency: meta?.currency ?? s.production.currency,
            },
          };
        });
        get().logActivity({
          action: "imported",
          entity: "budget",
          description:
            `Imported ${lines.length} budget ${lines.length === 1 ? "line" : "lines"}` +
            (meta?.fileName ? ` from ${meta.fileName}` : "") +
            (mode === "replace" ? ` (replaced ${replaced.length})` : ""),
          meta: { mode, count: lines.length, fileName: meta?.fileName },
        });
        if (mode === "replace" && replaced.length > 0) {
          pushToast({
            title: "Budget replaced",
            description: `${replaced.length} previous ${replaced.length === 1 ? "line" : "lines"} removed`,
            tone: "danger",
            action: {
              label: "Undo",
              run: () => set({ budgetLines: replaced }),
            },
          });
        }
      },

      // ---- VFX ----
      updateShotStatus: (sid, status) =>
        set((s) => ({
          vfxShots: s.vfxShots.map((sh) => (sh.id === sid ? { ...sh, status } : sh)),
        })),

      assignShotVendor: (shotId, vendorId) =>
        set((s) => ({
          vfxShots: s.vfxShots.map((sh) => (sh.id === shotId ? { ...sh, vendorId } : sh)),
          vfxVendors: s.vfxVendors.map((v) =>
            v.id === vendorId && !v.assignedShots.includes(shotId)
              ? { ...v, assignedShots: [...v.assignedShots, shotId] }
              : v
          ),
        })),

      // ---- Timesheet ----
      editTimesheetHours: (entryId, newHours, byUserId, isAdmin) => {
        const prev = get().timesheet.find((e) => e.id === entryId);
        set((s) => ({
          timesheet: s.timesheet.map((e) =>
            e.id === entryId
              ? {
                  ...e,
                  hours: newHours,
                  edits: [
                    ...e.edits,
                    {
                      at: new Date().toISOString(),
                      by: byUserId,
                      fromHours: e.hours,
                      toHours: newHours,
                      isAdminOverride: isAdmin && e.submitted,
                    },
                  ],
                }
              : e
          ),
        }));
        get().logActivity({
          action: "hours_edited",
          entity: "timesheet",
          entityId: entryId,
          description: `Hours ${prev?.hours ?? "?"} → ${newHours} for ${prev?.date ?? ""}`,
          meta: { crewMemberId: prev?.crewMemberId, isAdminOverride: isAdmin && prev?.submitted },
        });
      },

      submitTimesheetForCrew: (crewMemberId) => {
        set((s) => ({
          timesheet: s.timesheet.map((e) =>
            e.crewMemberId === crewMemberId && !e.submitted
              ? { ...e, submitted: true, submittedAt: new Date().toISOString() }
              : e
          ),
        }));
        get().logActivity({
          action: "submitted",
          entity: "timesheet",
          entityId: crewMemberId,
          description: `Submitted timesheet`,
        });
      },

      // ---- Notifications ----
      markNotificationRead: (nid) =>
        set((s) => ({
          notifications: s.notifications.map((n) => (n.id === nid ? { ...n, read: true } : n)),
        })),

      markAllRead: () =>
        set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),

      addNotification: (n) =>
        set((s) => ({
          notifications: [
            { ...n, id: id("n"), createdAt: new Date().toISOString(), read: false },
            ...s.notifications,
          ],
        })),

      // ---- AI ----
      recordAIUsage: (entry) =>
        set((s) => ({
          aiUsage: [{ ...entry, id: id("u"), at: new Date().toISOString() }, ...s.aiUsage],
        })),

      setAIConfig: (patch) => set((s) => ({ aiConfig: { ...s.aiConfig, ...patch } })),

      // ---- AI background jobs (E1) ----
      // These only track status; the async work lives in the feature that
      // started the job and reports through here. Because the state lives in
      // the store, navigating away from the tab that kicked it off never
      // cancels the run and the TopBar pill can render it from anywhere.
      aiJobBegin: (key, opts) =>
        set((s) => ({
          aiJobs: {
            ...s.aiJobs,
            [key]: {
              status: "running",
              progress: { done: 0, total: Math.max(0, opts.total) },
              label: opts.label,
              route: opts.route,
              startedAt: new Date().toISOString(),
            },
          },
        })),
      aiJobProgress: (key, done, total) =>
        set((s) => {
          const job = s.aiJobs[key];
          if (!job) return {};
          return {
            aiJobs: {
              ...s.aiJobs,
              [key]: {
                ...job,
                status: "running",
                progress: { done, total: total ?? job.progress.total },
              },
            },
          };
        }),
      aiJobPauseLimit: (key, error) =>
        set((s) => {
          const job = s.aiJobs[key];
          if (!job) return {};
          return {
            aiJobs: {
              ...s.aiJobs,
              [key]: { ...job, status: "paused_limit", error, limitHit: true },
            },
          };
        }),
      aiJobDone: (key) =>
        set((s) => {
          const job = s.aiJobs[key];
          if (!job) return {};
          return {
            aiJobs: {
              ...s.aiJobs,
              [key]: {
                ...job,
                status: "done",
                finishedAt: new Date().toISOString(),
                progress: { ...job.progress, done: job.progress.total || job.progress.done },
              },
            },
          };
        }),
      aiJobFail: (key, error) =>
        set((s) => {
          const job = s.aiJobs[key];
          if (!job) return {};
          return {
            aiJobs: { ...s.aiJobs, [key]: { ...job, status: "error", error } },
          };
        }),
      aiJobReset: (key) =>
        set((s) => {
          if (!s.aiJobs[key]) return {};
          const next = { ...s.aiJobs };
          delete next[key];
          return { aiJobs: next };
        }),

      // ---- Background script breakdown ----
      startBreakdownRun: async (input) => {
        const { projectId, projectName, scenes, source, fileName, rawText, pageCount } = input;
        const startedAt = Date.now();
        set({
          breakdownRun: {
            projectId,
            projectName,
            scenes,
            results: {},
            progress: { done: 0, total: scenes.length, currentSceneNumber: "", stage: "characters" },
            status: "running",
            startedAt,
            runSeconds: 0,
            retrying: false,
            source,
            fileName,
            rawText,
            pageCount,
            characters: [],
            locations: [],
            failedScenes: [],
            usedDemo: false,
            autoRetry: true,
          },
        });
        // Track in the global job registry so the TopBar pill renders it from
        // any page; the route deep-links back to the review dialog.
        get().aiJobBegin("script_breakdown", {
          label: "Script breakdown",
          total: scenes.length,
          route: "/projects?review=1",
        });

        try {
          const res = await runBreakdown(
            scenes,
            (p) => {
              set((s) => (s.breakdownRun ? { breakdownRun: { ...s.breakdownRun, progress: p } } : {}));
              get().aiJobProgress("script_breakdown", p.done, p.total);
            },
            projectName,
            (e) => {
              set((s) =>
                s.breakdownRun
                  ? {
                      breakdownRun: {
                        ...s.breakdownRun,
                        results: {
                          ...s.breakdownRun.results,
                          [e.sceneId]: { elements: e.elements, fallback: e.fallback },
                        },
                      },
                    }
                  : {}
              );
            }
          );

          const runSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
          // Land results on the run's project. switchProject is a no-op when it
          // is already active (the common path); if the user browsed to another
          // project mid-run it puts the results where they belong.
          get().switchProject(projectId);
          get().replaceScenes(res.scenes);
          get().setCharacterBible(res.characters);
          get().setProjectScript({
            fileName: source === "pdf" ? fileName : undefined,
            rawText,
            uploadedAt: new Date().toISOString(),
            pageCount,
            source,
          });
          res.usage.forEach((u) => get().recordAIUsage(u));
          get().aiJobDone("script_breakdown");

          const cooldown = classifyAIFailure(res.failedScenes, res.fromMock);
          set((s) =>
            s.breakdownRun
              ? {
                  breakdownRun: {
                    ...s.breakdownRun,
                    status: "done",
                    runSeconds,
                    characters: res.characters,
                    locations: res.locations,
                    failedScenes: res.failedScenes,
                    usedDemo: res.fromMock,
                    cooldownUntil: cooldown ? Date.now() + cooldown.seconds * 1000 : undefined,
                    cooldownKind: cooldown?.kind,
                  },
                }
              : {}
          );

          const elementCount = res.scenes.reduce((n, sc) => n + sc.elements.length, 0);
          pushToast({
            title: "Breakdown complete",
            description:
              res.failedScenes.length > 0
                ? `${res.scenes.length} scenes · ${res.failedScenes.length} need a retry`
                : `${res.scenes.length} scenes · ${elementCount} elements`,
            tone: res.failedScenes.length > 0 ? "warning" : "success",
            action: { label: "Review", run: () => navigateTo("/projects?review=1") },
          });
        } catch (e) {
          const msg = (e as Error).message || "Breakdown failed.";
          get().aiJobFail("script_breakdown", msg);
          set((s) => (s.breakdownRun ? { breakdownRun: { ...s.breakdownRun, status: "error", error: msg } } : {}));
          pushToast({ title: "Breakdown failed", description: msg, tone: "danger" });
        }
      },

      retryBreakdownScenes: async () => {
        const run = get().breakdownRun;
        if (!run || run.retrying) return;
        // Everything that used the offline heuristic is worth another live pass.
        const targets = run.scenes.filter((sc) => run.results[sc.id]?.fallback);
        if (targets.length === 0) return;

        set({
          breakdownRun: { ...run, retrying: true, cooldownUntil: undefined, cooldownKind: undefined },
        });
        get().aiJobBegin("script_breakdown", {
          label: `Retrying ${targets.length} scene${targets.length === 1 ? "" : "s"}`,
          total: targets.length,
          route: "/projects?review=1",
        });

        try {
          const res = await retryBreakdownScenes(
            targets,
            run.characters,
            run.projectName,
            (p) => get().aiJobProgress("script_breakdown", p.done, p.total),
            (e) => {
              set((s) =>
                s.breakdownRun
                  ? {
                      breakdownRun: {
                        ...s.breakdownRun,
                        results: {
                          ...s.breakdownRun.results,
                          [e.sceneId]: { elements: e.elements, fallback: e.fallback },
                        },
                      },
                    }
                  : {}
              );
            }
          );

          // Merge the retried scenes back into the project's scene list.
          get().switchProject(run.projectId);
          const byId = new Map(res.scenes.map((sc) => [sc.id, sc]));
          const merged = get().scenes.map((sc) => byId.get(sc.id) ?? sc);
          get().replaceScenes(merged);
          res.usage.forEach((u) => get().recordAIUsage(u));
          get().aiJobDone("script_breakdown");

          const cooldown = classifyAIFailure(res.failedScenes, res.fromMock);
          set((s) => {
            if (!s.breakdownRun) return {};
            const stillFailed = new Set(res.failedScenes.map((f) => f.sceneNumber));
            // Keep any earlier failures that weren't in this retry batch.
            const carried = s.breakdownRun.failedScenes.filter(
              (f) => !targets.some((t) => t.number === f.sceneNumber)
            );
            return {
              breakdownRun: {
                ...s.breakdownRun,
                retrying: false,
                failedScenes: [...carried, ...res.failedScenes.filter((f) => stillFailed.has(f.sceneNumber))],
                usedDemo: s.breakdownRun.usedDemo && res.fromMock,
                cooldownUntil: cooldown ? Date.now() + cooldown.seconds * 1000 : undefined,
                cooldownKind: cooldown?.kind,
              },
            };
          });

          const remaining = get().breakdownRun?.failedScenes.length ?? 0;
          pushToast({
            title: remaining > 0 ? "Some scenes still need a retry" : "All scenes analyzed",
            description:
              remaining > 0
                ? `${remaining} scene${remaining === 1 ? "" : "s"} left`
                : "Every scene is now broken down live.",
            tone: remaining > 0 ? "warning" : "success",
          });
        } catch (e) {
          const msg = (e as Error).message || "Retry failed.";
          get().aiJobFail("script_breakdown", msg);
          set((s) => (s.breakdownRun ? { breakdownRun: { ...s.breakdownRun, retrying: false } } : {}));
          pushToast({ title: "Retry failed", description: msg, tone: "danger" });
        }
      },

      setBreakdownAutoRetry: (on) =>
        set((s) => (s.breakdownRun ? { breakdownRun: { ...s.breakdownRun, autoRetry: on } } : {})),

      clearBreakdownRun: () => set({ breakdownRun: null }),

      // ---- Checklists ----
      toggleChecklistItem: (checklistId, itemId, byUserId) =>
        set((s) => ({
          checklists: s.checklists.map((c) =>
            c.id === checklistId
              ? {
                  ...c,
                  items: c.items.map((it) =>
                    it.id === itemId
                      ? {
                          ...it,
                          done: !it.done,
                          doneAt: !it.done ? new Date().toISOString() : undefined,
                          doneBy: !it.done ? byUserId : undefined,
                        }
                      : it
                  ),
                }
              : c
          ),
        })),

      // ---- RF ----
      assignRFEquipmentToDay: (equipmentId, day) =>
        set((s) => ({
          rfEquipment: s.rfEquipment.map((e) =>
            e.id === equipmentId
              ? { ...e, assignedShootDay: day ?? undefined, status: day ? "assigned" : "available" }
              : e
          ),
        })),

      // ---- Camera ----
      assignKitToDay: (kitId, day) =>
        set((s) => ({
          cameraKits: s.cameraKits.map((k) =>
            k.id === kitId ? { ...k, assignedShootDay: day ?? undefined } : k
          ),
        })),

      // ---- Art ----
      updateArtElementStatus: (aid, status) =>
        set((s) => ({
          artElements: s.artElements.map((e) => (e.id === aid ? { ...e, status } : e)),
        })),

      // ========================================================
      // GENERIC RECORD CRUD
      // ========================================================
      // Drives every schema-backed collection. The shape of a record is
      // defined once in src/data/schemas.ts; these three actions are the
      // only write path the entry UI needs.
      addRecord: (collection, values) => {
        const schema = SCHEMAS[collection];
        const rec = {
          ...(schema.fromForm ? schema.fromForm(values) : values),
          id: id(schema.idPrefix),
        } as { id: string };
        set((s) => ({
          [collection]: [...(s[collection] as unknown[]), rec],
        }) as Partial<State>);
        get().logActivity({
          action: "created",
          entity: schema.entity,
          entityId: rec.id,
          description: `Added ${schema.singular.toLowerCase()}: ${schema.label(rec)}`,
        });
        // A location's lockDate is a deadline anchor, so writing one has to
        // move every task hanging off it.
        if (collection === "locations") get().recomputeAllDeadlines();
        return rec.id;
      },

      updateRecord: (collection, rid, values) => {
        const schema = SCHEMAS[collection];
        const prev = (get()[collection] as { id: string }[]).find((r) => r.id === rid);
        if (!prev) return;
        const next = {
          ...prev,
          ...(schema.fromForm ? schema.fromForm(values, prev) : values),
          id: rid,
        };
        set((s) => ({
          [collection]: (s[collection] as { id: string }[]).map((r) =>
            r.id === rid ? next : r
          ),
        }) as Partial<State>);
        get().logActivity({
          action: "updated",
          entity: schema.entity,
          entityId: rid,
          description: `Updated ${schema.singular.toLowerCase()}: ${schema.label(next)}`,
        });
        if (collection === "locations") get().recomputeAllDeadlines();
      },

      deleteRecord: (collection, rid) => {
        const schema = SCHEMAS[collection];
        const list = get()[collection] as { id: string }[];
        const index = list.findIndex((r) => r.id === rid);
        const prev = list[index];
        if (!prev) return;
        set((s) => ({
          [collection]: (s[collection] as { id: string }[]).filter((r) => r.id !== rid),
        }) as Partial<State>);
        get().logActivity({
          action: "deleted",
          entity: schema.entity,
          entityId: rid,
          description: `Deleted ${schema.singular.toLowerCase()}: ${schema.label(prev)}`,
        });
        if (collection === "locations") get().recomputeAllDeadlines();
        pushToast({
          title: `${schema.singular} deleted`,
          description: schema.label(prev),
          tone: "danger",
          action: {
            label: "Undo",
            run: () => {
              // Re-insert at its original position.
              set((s) => {
                const arr = (s[collection] as { id: string }[]).slice();
                arr.splice(Math.min(index, arr.length), 0, prev);
                return { [collection]: arr } as Partial<State>;
              });
              if (collection === "locations") get().recomputeAllDeadlines();
            },
          },
        });
      },

      // ========================================================
      // CAST
      // ========================================================
      addCastMember: (c) => {
        const nc: CastMember = { ...c, id: id("cast") };
        set((s) => ({ cast: [...s.cast, nc] }));
        get().logActivity({
          action: "created",
          entity: "cast",
          entityId: nc.id,
          description: `Added cast: ${nc.name} as ${nc.role}`,
        });
      },

      updateCastMember: (cid, patch) => {
        set((s) => ({
          cast: s.cast.map((c) => (c.id === cid ? { ...c, ...patch } : c)),
        }));
        const c = get().cast.find((x) => x.id === cid);
        get().logActivity({
          action: "updated",
          entity: "cast",
          entityId: cid,
          description: `Updated cast ${c?.name ?? cid}`,
          meta: { fields: Object.keys(patch) },
        });
      },

      removeCastMember: (cid) => {
        const idx = get().cast.findIndex((x) => x.id === cid);
        const c = get().cast[idx];
        if (!c) return;
        const prevDoodRow = get().dood[cid];
        set((s) => {
          const nextDood = { ...s.dood };
          delete nextDood[cid];
          return { cast: s.cast.filter((x) => x.id !== cid), dood: nextDood };
        });
        get().logActivity({
          action: "deleted",
          entity: "cast",
          entityId: cid,
          description: `Removed cast ${c.name}`,
        });
        pushToast({
          title: "Cast member removed",
          description: `${c.name} — ${c.role}`,
          tone: "danger",
          action: {
            label: "Undo",
            run: () =>
              set((s) => {
                const arr = s.cast.slice();
                arr.splice(Math.min(idx, arr.length), 0, c);
                return {
                  cast: arr,
                  dood: prevDoodRow ? { ...s.dood, [cid]: prevDoodRow } : s.dood,
                };
              }),
          },
        });
      },

      /**
       * Derives the DOOD grid from what the schedule already says: a cast
       * member works the days holding their scenes, holds through the gaps in
       * between, and is off outside that span. It's a first draft — the AD's
       * own edits are never touched, only blank cells are filled.
       */
      seedDoodFromSchedule: () => {
        const state = get();
        const days = [...state.shootDays].sort((a, b) => a.dayNumber - b.dayNumber);
        if (days.length === 0 || state.cast.length === 0) return 0;

        const dood: DoodMatrix = { ...state.dood };
        let filled = 0;

        for (const member of state.cast) {
          const scenes = new Set(member.scenes);
          const working = days
            .filter((d) => d.scenes.some((sid) => scenes.has(sid)))
            .map((d) => d.dayNumber);
          if (working.length === 0) continue;

          const first = working[0];
          const last = working[working.length - 1];
          const row = { ...(dood[member.id] ?? {}) };

          for (const day of days) {
            const n = day.dayNumber;
            if (row[n] !== undefined) continue; // someone set this already
            let status: DoodStatus;
            if (working.includes(n)) {
              status =
                first === last ? "SWF" : n === first ? "SW" : n === last ? "WF" : "W";
            } else if (n > first && n < last) {
              status = "H";
            } else {
              status = "OFF";
            }
            row[n] = status;
            filled += 1;
          }
          dood[member.id] = row;
        }

        if (filled === 0) return 0;
        set({ dood });
        get().logActivity({
          action: "dood_seeded",
          entity: "dood",
          description: `Seeded ${filled} DOOD cell${filled === 1 ? "" : "s"} from the schedule`,
          meta: { cells: filled },
        });
        return filled;
      },

      setDoodStatus: (castId, day, status) => {
        set((s) => ({
          dood: { ...s.dood, [castId]: { ...(s.dood[castId] ?? {}), [day]: status } },
        }));
        const c = get().cast.find((x) => x.id === castId);
        get().logActivity({
          action: "dood_set",
          entity: "dood",
          entityId: castId,
          description: `Set ${c?.name ?? castId} · Day ${day} → ${status}`,
        });
      },

      // ========================================================
      // CREW
      // ========================================================
      addCrewMember: (c) => {
        const nc: CrewMember = { ...c, id: id("crew") };
        set((s) => ({ crew: [...s.crew, nc] }));
        get().logActivity({
          action: "created",
          entity: "crew",
          entityId: nc.id,
          description: `Added crew: ${nc.name} (${nc.role})`,
        });
      },

      updateCrewMember: (cid, patch) => {
        set((s) => ({
          crew: s.crew.map((c) => (c.id === cid ? { ...c, ...patch } : c)),
        }));
        get().logActivity({
          action: "updated",
          entity: "crew",
          entityId: cid,
          description: `Updated crew`,
          meta: { fields: Object.keys(patch) },
        });
      },

      removeCrewMember: (cid) => {
        const c = get().crew.find((x) => x.id === cid);
        set((s) => ({ crew: s.crew.filter((x) => x.id !== cid) }));
        get().logActivity({
          action: "deleted",
          entity: "crew",
          entityId: cid,
          description: `Removed crew ${c?.name ?? cid}`,
        });
      },

      // ========================================================
      // TIMESHEET (add-day)
      // ========================================================
      addTimesheetEntry: (e) => {
        // De-dupe on same crew+date.
        const dupe = get().timesheet.find(
          (t) => t.crewMemberId === e.crewMemberId && t.date === e.date
        );
        if (dupe) return;
        const ne: TimesheetEntry = {
          ...e,
          id: id("ts"),
          submitted: false,
          edits: [],
        };
        set((s) => ({ timesheet: [...s.timesheet, ne] }));
        get().logActivity({
          action: "created",
          entity: "timesheet",
          entityId: ne.id,
          description: `Logged ${ne.hours}h for ${ne.date}`,
          meta: { crewMemberId: ne.crewMemberId },
        });
      },

      // ========================================================
      // ACTIVITY LOG
      // ========================================================
      logActivity: (entry) => {
        const state = get();
        const u = state.users.find((x) => x.id === state.currentUserId);
        const ne: ActivityLogEntry = {
          ...entry,
          id: id("act"),
          at: new Date().toISOString(),
          userId: u?.id ?? "",
          userLabel: u?.displayName ?? "System",
        };
        set((s) => ({
          // Cap the log at 2000 entries to keep localStorage bounded.
          activityLog: [ne, ...s.activityLog].slice(0, 2000),
        }));
      },

      clearActivityLog: () => set({ activityLog: [] }),
    }),
    {
      name: "scenetrackable-v1",
      storage: createJSONStorage(() => localStorage),
      version: 5,
      // aiJobs / breakdownRun are deliberately transient: on reload an
      // interrupted run must present as resumable (its results were saved
      // incrementally), never as still-running against a promise that no
      // longer exists.
      partialize: (state) => {
        const { aiJobs: _aiJobs, breakdownRun: _breakdownRun, ...rest } = state;
        return rest as State;
      },
      migrate: (persisted, from) => {
        const s = persisted as Record<string, any>;
        // Ascending, and it has to stay that way: each step assumes the ones
        // before it have already run.
        if (from < 2) {
          // v2 gave locations their own collection. Lock dates were the only
          // location data the app held, so they become the first records —
          // stranding them would silently break location_lock deadlines.
          adoptLegacyLocations(s);
          for (const pid of Object.keys(s.projectData ?? {})) {
            adoptLegacyLocations(s.projectData[pid]);
          }
        }
        if (from < 5) {
          // v1-v4 migrations rewrote a saved Claude/Gemini model pick as those
          // ids were retired. The app now calls one compiled-in model, so the
          // saved pick means nothing — drop it rather than carry it forward.
          const ai = s.aiConfig as (AIConfig & { model?: string; lightModel?: string; apiKey?: string }) | undefined;
          if (ai) {
            delete ai.model;
            delete ai.lightModel;
            delete ai.apiKey;
          }
        }
        return s;
      },
    }
  )
);

// A pull rewrites localStorage underneath us; this is how the live store
// picks that up without a full page reload. Awaited by the caller: a pull
// isn't finished until the store actually reflects it.
registerRehydrate(() => useStore.persist.rehydrate());

// ============================================================
// SELECTORS
// ============================================================

export const currentUser = (state: State): User | undefined =>
  state.users.find((u) => u.id === state.currentUserId);

export const currentRole = (state: State): Role | undefined => {
  const roleId = state.activeRole ?? currentUser(state)?.roleId;
  return state.roles.find((r) => r.id === roleId);
};

export const isCurrentAdmin = (state: State): boolean => isAdminRole(currentRole(state));

export const activeProject = (state: State): Project | undefined =>
  state.projects.find((p) => p.id === state.activeProjectId);

export const unreadCount = (state: State): number =>
  state.notifications.filter((n) => !n.read).length;

/**
 * The AI job worth surfacing in the TopBar pill: a running job first, else one
 * paused on the allowance limit. Everything else (idle/done/error) is shown on
 * its own tab, not globally.
 */
export const activeAIJob = (
  state: State
): { key: string; job: AIJobState } | null => {
  const entries = Object.entries(state.aiJobs);
  const running = entries.find(([, j]) => j.status === "running");
  if (running) return { key: running[0], job: running[1] };
  const paused = entries.find(([, j]) => j.status === "paused_limit");
  if (paused) return { key: paused[0], job: paused[1] };
  return null;
};

/** The current role's level on a page: "none" | "read" | "write". */
export function permissionLevel(state: State, key: string): PermissionLevel {
  return permissionFor(currentRole(state), key);
}

/** Can the current role open a given page access key? */
export function canAccess(state: State, key: string): boolean {
  return permissionLevel(state, key) !== "none";
}

/** Can the current role change anything on a given page? */
export function canWrite(state: State, key: string): boolean {
  return permissionLevel(state, key) === "write";
}
