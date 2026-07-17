import type { Role, PermissionLevel, RolePermissions } from "@/types";

/**
 * Page access keys. A role's `access` array lists the pages it can open.
 * The special value "all" grants everything, including AI Settings and the
 * Admin console (user & role management).
 */
export const ACCESS_KEYS: { key: string; label: string }[] = [
  { key: "breakdown", label: "Script Breakdown" },
  { key: "schedule", label: "Schedule" },
  { key: "locations", label: "Locations" },
  { key: "tasks", label: "Tasks" },
  { key: "budget", label: "Budget" },
  { key: "vfx", label: "VFX Pipeline" },
  { key: "rf", label: "RF / Comms" },
  { key: "camera", label: "Camera" },
  { key: "art", label: "Art / Wardrobe" },
  { key: "cast", label: "Cast" },
  { key: "timesheet", label: "Timesheet" },
  { key: "reports", label: "Reports" },
];

export const PERMISSION_LEVELS: { level: PermissionLevel; label: string; hint: string }[] = [
  { level: "none", label: "No access", hint: "Page is hidden entirely" },
  { level: "read", label: "Read", hint: "Can open and view, cannot change anything" },
  { level: "write", label: "Read & write", hint: "Can view and edit" },
];

/** Build a permission map: everything "none", then the listed keys raised. */
export function permissionMap(
  read: string[] = [],
  write: string[] = []
): RolePermissions {
  const map: RolePermissions = {};
  for (const { key } of ACCESS_KEYS) map[key] = "none";
  for (const key of read) map[key] = "read";
  for (const key of write) map[key] = "write";
  return map;
}

const everyKey = ACCESS_KEYS.map((k) => k.key);

/**
 * Starting points an admin can apply in the role editor, then fine-tune.
 * `admin: true` means the preset grants "all" and ignores `permissions`.
 */
export interface RolePreset {
  id: string;
  label: string;
  description: string;
  admin?: boolean;
  permissions: RolePermissions;
}

export const ROLE_PRESETS: RolePreset[] = [
  {
    id: "full_admin",
    label: "Administrator",
    description: "Everything, plus users, roles and AI settings.",
    admin: true,
    permissions: permissionMap([], everyKey),
  },
  {
    id: "producer",
    label: "Producer",
    description: "Write access to every page, but no user/role or AI administration.",
    permissions: permissionMap([], everyKey),
  },
  {
    id: "observer",
    label: "Read-only observer",
    description: "Can see every page. Cannot change anything.",
    permissions: permissionMap(everyKey, []),
  },
  {
    id: "scheduler",
    label: "1st AD / Scheduler",
    description: "Owns schedule, strip board and DOOD; reads the breakdown and budget.",
    permissions: permissionMap(
      ["breakdown", "budget", "reports"],
      ["schedule", "locations", "tasks", "cast"]
    ),
  },
  {
    id: "accountant",
    label: "Accountant",
    description: "Owns budget and timesheets; reads schedule to cost it.",
    permissions: permissionMap(["schedule", "reports"], ["budget", "timesheet", "tasks"]),
  },
  {
    id: "dept_head",
    label: "Department head",
    description: "Writes their own tasks; reads the breakdown, schedule and locations.",
    permissions: permissionMap(["breakdown", "schedule", "locations", "reports"], ["tasks"]),
  },
  {
    id: "crew",
    label: "Crew member",
    description: "Reads the schedule and breakdown; logs their own hours.",
    permissions: permissionMap(["breakdown", "schedule"], ["timesheet"]),
  },
  {
    id: "locked",
    label: "No access",
    description: "Dashboard only — every page off. A good base to build from.",
    permissions: permissionMap([], []),
  },
];

export const DEFAULT_ROLES: Role[] = [
  {
    id: "admin",
    label: "Administrator",
    description: "Full oversight of every project, department, users, roles, and AI.",
    access: ["all"],
    builtIn: true,
  },
  {
    id: "scheduler",
    label: "1st AD / Scheduler",
    description: "Owns the shooting schedule, strip board, and DOOD.",
    access: ["breakdown", "schedule", "locations", "tasks", "cast", "reports"],
    permissions: permissionMap(
      ["breakdown", "reports"],
      ["schedule", "locations", "tasks", "cast"]
    ),
    builtIn: true,
  },
  {
    id: "accountant",
    label: "Accountant",
    description: "Manages the budget, POs, invoices, and petty cash.",
    department: "accounting",
    access: ["budget", "tasks", "reports"],
    permissions: permissionMap(["reports"], ["budget", "tasks"]),
    builtIn: true,
  },
  {
    id: "camera",
    label: "Camera / Technical",
    description: "Equipment manifests, kit builds, and prep checklists.",
    department: "camera",
    access: ["camera", "breakdown", "schedule", "tasks"],
    permissions: permissionMap(["breakdown", "schedule"], ["camera", "tasks"]),
    builtIn: true,
  },
  {
    id: "rf_comms",
    label: "RF / Comms",
    description: "Frequency coordination and wireless equipment.",
    department: "rf",
    // Comms plans are built per location, so this role reads the bible too.
    access: ["rf", "schedule", "locations", "tasks"],
    permissions: permissionMap(["schedule", "locations"], ["rf", "tasks"]),
    builtIn: true,
  },
  {
    id: "vfx",
    label: "VFX Supervisor",
    description: "Shot pipeline, vendor management, plate delivery.",
    department: "vfx",
    access: ["vfx", "breakdown", "tasks"],
    permissions: permissionMap(["breakdown"], ["vfx", "tasks"]),
    builtIn: true,
  },
  {
    id: "art",
    label: "Art / Wardrobe / Props",
    description: "Element tracking, continuity, and set dressing.",
    department: "art",
    access: ["art", "breakdown", "tasks"],
    permissions: permissionMap(["breakdown"], ["art", "tasks"]),
    builtIn: true,
  },
  {
    id: "cast",
    label: "Cast Coordinator",
    description: "Cast schedules, DOOD, contracts, and call sheets.",
    department: "cast",
    access: ["cast", "schedule", "tasks"],
    permissions: permissionMap([], ["cast", "schedule", "tasks"]),
    builtIn: true,
  },
];

export const getRoleFrom = (roles: Role[], id: string): Role | undefined =>
  roles.find((r) => r.id === id);
