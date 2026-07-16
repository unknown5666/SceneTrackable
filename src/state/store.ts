import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
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
  ProductionMeta,
  ProductionData,
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
} from "@/types";
import { isAdminRole } from "@/types";
import { DEFAULT_ROLES } from "@/data/roles";
import { evaluateDeadline } from "@/lib/deadlines";
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
    equipmentCheckouts: [],
    checklists: [],
    artElements: [],
    continuityPhotos: [],
    timesheet: [],
    notifications: [],
    activityLog: [],
  };
}

/** Field names that make up the active-project working set. */
const DATA_KEYS = Object.keys(blankData("")) as (keyof ProductionData)[];

function captureActive(state: State): ProductionData {
  const out = {} as ProductionData;
  for (const k of DATA_KEYS) {
    // @ts-expect-error dynamic copy across matching keys
    out[k] = state[k];
  }
  return out;
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

  // ---- Projects ----
  projects: Project[];
  activeProjectId: string | null;
  projectData: Record<string, ProductionData>;

  // ---- Global AI ----
  aiUsage: AIUsageEntry[];
  aiConfig: AIConfig;

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
  updateRole: (id: string, patch: Partial<Role>) => void;
  removeRole: (id: string) => string | null; // returns error message or null

  setActiveRole: (role: RoleId | null) => void;
  markTutorialSeen: () => void;

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
  setLocationLock: (locationId: string, date: string) => void;

  cycleDoodCell: (castId: string, day: number) => void;

  createTask: (task: Omit<Task, "id" | "createdAt" | "updatedAt" | "computedDeadline"> & { computedDeadline?: string }) => void;
  updateTaskStatus: (id: string, status: TaskStatus) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;

  submitPO: (po: Omit<PurchaseOrder, "id" | "requestedAt" | "status" | "approvals" | "auditLog" | "number">) => void;
  advancePO: (id: string, decision: "approve" | "reject", byUserId: string, note?: string) => void;
  addPettyCash: (entry: Omit<PettyCashEntry, "id">) => void;

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

  toggleChecklistItem: (checklistId: string, itemId: string, byUserId: string) => void;
  assignRFEquipmentToDay: (equipmentId: string, day: number | null) => void;
  assignKitToDay: (kitId: string, day: number | null) => void;
  updateArtElementStatus: (id: string, status: ArtElement["status"]) => void;
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

      // ---- Projects ----
      projects: [],
      activeProjectId: null,
      projectData: {},

      // ---- AI ----
      aiUsage: [],
      aiConfig: { model: "claude-opus-4-8", alertThresholdPct: 80 },

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
      addRole: (r) =>
        set((s) => ({ roles: [...s.roles, { ...r, id: id("role") }] })),

      updateRole: (rid, patch) =>
        set((s) => ({
          roles: s.roles.map((r) =>
            r.id === rid ? { ...r, ...patch, id: r.id } : r
          ),
        })),

      removeRole: (rid) => {
        const state = get();
        const role = state.roles.find((r) => r.id === rid);
        if (!role) return "Role not found.";
        if (role.builtIn) return "Built-in roles cannot be deleted.";
        if (state.users.some((u) => u.roleId === rid))
          return "Reassign users on this role before deleting it.";
        set({ roles: state.roles.filter((r) => r.id !== rid) });
        return null;
      },

      setActiveRole: (role) => set({ activeRole: role }),
      markTutorialSeen: () => set({ tutorialSeen: true }),

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
        const target =
          projectData[pid] ??
          blankData(state.projects.find((p) => p.id === pid)?.name ?? "Project");
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
            const target = projectData[next.id] ?? blankData(next.name);
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
        const ctx = {
          shootDays: state.shootDays,
          locationLockDates: state.locationLockDates,
        };
        set({
          tasks: state.tasks.map((t) => {
            const nd = evaluateDeadline(t.deadlineRule, ctx);
            return nd ? { ...t, computedDeadline: nd, updatedAt: new Date().toISOString() } : t;
          }),
        });
      },

      setLocationLock: (locationId, date) => {
        set((s) => ({
          locationLockDates: { ...s.locationLockDates, [locationId]: date },
        }));
        get().recomputeAllDeadlines();
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
          evaluateDeadline(task.deadlineRule, {
            shootDays: s.shootDays,
            locationLockDates: s.locationLockDates,
          }) ??
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
        const t = get().tasks.find((x) => x.id === tid);
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== tid) }));
        get().logActivity({
          action: "deleted",
          entity: "task",
          entityId: tid,
          description: `Deleted task “${t?.title ?? tid}”`,
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
        const c = get().cast.find((x) => x.id === cid);
        set((s) => {
          const nextDood = { ...s.dood };
          delete nextDood[cid];
          return { cast: s.cast.filter((x) => x.id !== cid), dood: nextDood };
        });
        get().logActivity({
          action: "deleted",
          entity: "cast",
          entityId: cid,
          description: `Removed cast ${c?.name ?? cid}`,
        });
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
      version: 1,
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

/** Can the current role open a given page access key? */
export function canAccess(state: State, key: string): boolean {
  const role = currentRole(state);
  if (!role) return false;
  return role.access.includes("all") || role.access.includes(key);
}
