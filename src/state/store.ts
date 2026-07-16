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
} from "@/types";
import { isAdminRole } from "@/types";
import { DEFAULT_ROLES } from "@/data/roles";
import { evaluateDeadline } from "@/lib/deadlines";
import { id, verifyPassword, hashPassword, HASH_PREFIX } from "@/lib/utils";

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
  logout: () => void;
  addUser: (u: Omit<User, "id" | "createdAt">) => void;
  updateUser: (id: string, patch: Partial<User>) => void;
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
        if (!(await verifyPassword(user.password, password))) return false;
        // Transparently upgrade legacy plaintext records to hashed storage.
        if (!user.password.startsWith(HASH_PREFIX)) {
          const hashed = await hashPassword(password);
          set((s) => ({
            users: s.users.map((u) => (u.id === user.id ? { ...u, password: hashed } : u)),
          }));
        }
        set({ currentUserId: user.id, activeRole: user.roleId });
        return true;
      },

      logout: () => set({ currentUserId: "", activeRole: null }),

      addUser: (u) =>
        set((s) => ({
          users: [
            ...s.users,
            { ...u, id: id("user"), createdAt: new Date().toISOString() },
          ],
        })),

      updateUser: (uid, patch) =>
        set((s) => ({
          users: s.users.map((u) => (u.id === uid ? { ...u, ...patch } : u)),
        })),

      removeUser: (uid) =>
        set((s) => ({ users: s.users.filter((u) => u.id !== uid) })),

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
      createTask: (task) =>
        set((s) => {
          const computed =
            task.computedDeadline ??
            evaluateDeadline(task.deadlineRule, {
              shootDays: s.shootDays,
              locationLockDates: s.locationLockDates,
            }) ??
            new Date().toISOString();
          return {
            tasks: [
              ...s.tasks,
              {
                ...task,
                id: id("task"),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                computedDeadline: computed,
              },
            ],
          };
        }),

      updateTaskStatus: (tid, status) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === tid ? { ...t, status, updatedAt: new Date().toISOString() } : t
          ),
        })),

      updateTask: (tid, patch) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === tid ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
          ),
        })),

      deleteTask: (tid) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== tid) })),

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
      editTimesheetHours: (entryId, newHours, byUserId, isAdmin) =>
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
        })),

      submitTimesheetForCrew: (crewMemberId) =>
        set((s) => ({
          timesheet: s.timesheet.map((e) =>
            e.crewMemberId === crewMemberId && !e.submitted
              ? { ...e, submitted: true, submittedAt: new Date().toISOString() }
              : e
          ),
        })),

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
    }),
    {
      name: "scenetrackable-v1",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);

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
