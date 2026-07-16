import type { Role } from "@/types";

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
    builtIn: true,
  },
  {
    id: "accountant",
    label: "Accountant",
    description: "Manages the budget, POs, invoices, and petty cash.",
    department: "accounting",
    access: ["budget", "tasks", "reports"],
    builtIn: true,
  },
  {
    id: "camera",
    label: "Camera / Technical",
    description: "Equipment manifests, kit builds, and prep checklists.",
    department: "camera",
    access: ["camera", "breakdown", "schedule", "tasks"],
    builtIn: true,
  },
  {
    id: "rf_comms",
    label: "RF / Comms",
    description: "Frequency coordination and wireless equipment.",
    department: "rf",
    // Comms plans are built per location, so this role reads the bible too.
    access: ["rf", "schedule", "locations", "tasks"],
    builtIn: true,
  },
  {
    id: "vfx",
    label: "VFX Supervisor",
    description: "Shot pipeline, vendor management, plate delivery.",
    department: "vfx",
    access: ["vfx", "breakdown", "tasks"],
    builtIn: true,
  },
  {
    id: "art",
    label: "Art / Wardrobe / Props",
    description: "Element tracking, continuity, and set dressing.",
    department: "art",
    access: ["art", "breakdown", "tasks"],
    builtIn: true,
  },
  {
    id: "cast",
    label: "Cast Coordinator",
    description: "Cast schedules, DOOD, contracts, and call sheets.",
    department: "cast",
    access: ["cast", "schedule", "tasks"],
    builtIn: true,
  },
];

export const getRoleFrom = (roles: Role[], id: string): Role | undefined =>
  roles.find((r) => r.id === id);
