// ============================================================
// RECORD SCHEMAS — the single source of truth for data entry
// ============================================================
// Every editable collection describes its own fields here. The generic
// store actions (addRecord/updateRecord/deleteRecord) and the generic
// <RecordFormModal> both read from this registry, so adding a field to a
// collection — or a whole new collection — is a change to this file only.

import type { ActivityEntity, DepartmentId, ProductionData } from "@/types";

/** Collections that hold `{ id, ... }` records and are editable through the generic editor. */
export type RecordCollection =
  | "locations"
  | "shootDays"
  | "budgetLines"
  | "pettyCash"
  | "vfxShots"
  | "vfxVendors"
  | "frequencyPlan"
  | "rfEquipment"
  | "cameraKits"
  | "equipmentCheckouts"
  | "checklists"
  | "artElements"
  | "continuityPhotos";

export type FieldType =
  | "text"
  /** Dropdown of known values that also accepts a new one typed in. */
  | "combo"
  | "textarea"
  | "number"
  | "select"
  | "multiselect"
  | "checkbox"
  | "date"
  | "time"
  | "tags";

/** Where a select/multiselect/combo pulls its options from at render time. */
export type OptionSource =
  | "shootDays"
  | "scenes"
  | "cast"
  | "crew"
  | "vfxVendors"
  | "departments"
  | "locations";

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** Static options for select/multiselect. */
  options?: readonly string[];
  /** Dynamic options resolved from live store data. */
  optionsFrom?: OptionSource;
  placeholder?: string;
  help?: string;
  step?: number;
  min?: number;
  /** Value used when creating a new record. */
  default?: unknown;
  /** Full-width in the two-column form grid. */
  wide?: boolean;
}

export interface RecordSchema {
  /** Human label for one record, e.g. "Frequency". */
  singular: string;
  /** Prefix passed to id() when creating. */
  idPrefix: string;
  /** Activity-log entity bucket. */
  entity: ActivityEntity;
  /** One-line description of a record, used in activity log lines. */
  label: (rec: Record<string, any>) => string;
  fields: FieldSpec[];
  /** Record -> form values. Use when stored shape differs from the form shape. */
  toForm?: (rec: Record<string, any>) => Record<string, unknown>;
  /** Form values -> record. `prev` is the existing record on edit. */
  fromForm?: (
    values: Record<string, any>,
    prev?: Record<string, any>
  ) => Record<string, unknown>;
}

export const DEPARTMENTS: readonly DepartmentId[] = [
  "production",
  "camera",
  "sound",
  "vfx",
  "art",
  "wardrobe",
  "props",
  "accounting",
  "transport",
  "rf",
  "cast",
];

export const LOCATION_PERMIT_STATUSES = [
  "scouting",
  "optioned",
  "permit_pending",
  "locked",
  "wrapped",
] as const;

export const SCHEMAS: Record<RecordCollection, RecordSchema> = {
  // ----------------------------------------------------------
  locations: {
    singular: "Location",
    idPrefix: "loc",
    entity: "location",
    label: (r) => r.name,
    fields: [
      {
        key: "name",
        label: "Name",
        type: "text",
        required: true,
        placeholder: "JOHN'S APARTMENT",
        help: "Use the name as it appears in scene headings.",
      },
      {
        key: "type",
        label: "Type",
        type: "select",
        options: ["INT", "EXT", "INT/EXT", "STAGE"],
        default: "INT",
        required: true,
      },
      {
        key: "permitStatus",
        label: "Permit Status",
        type: "select",
        options: LOCATION_PERMIT_STATUSES,
        default: "scouting",
        required: true,
      },
      {
        key: "lockDate",
        label: "Lock Date",
        type: "date",
        help: "Drives location_lock(…) task deadlines.",
      },
      { key: "address", label: "Address", type: "text", wide: true },
      { key: "contactName", label: "Contact", type: "text" },
      { key: "contactPhone", label: "Contact Phone", type: "text" },
      { key: "costPerDay", label: "Cost / Day", type: "number", step: 0.01, min: 0 },
      {
        key: "aliases",
        label: "Aliases",
        type: "tags",
        wide: true,
        help: "One per line — other names the script uses for this place.",
        default: [],
      },
      { key: "parkingNotes", label: "Parking", type: "textarea", wide: true },
      { key: "powerNotes", label: "Power", type: "textarea", wide: true },
      { key: "notes", label: "Notes", type: "textarea", wide: true },
    ],
  },

  // ----------------------------------------------------------
  shootDays: {
    singular: "Shoot Day",
    idPrefix: "day",
    entity: "shoot_day",
    label: (r) => `Day ${r.dayNumber} — ${r.location}`,
    fields: [
      { key: "dayNumber", label: "Day Number", type: "number", required: true, min: 1, step: 1 },
      { key: "date", label: "Date", type: "date", required: true },
      {
        key: "location",
        label: "Location",
        type: "combo",
        optionsFrom: "locations",
        required: true,
        placeholder: "Stage 4 / Riverside Ext.",
        help: "Pick a known location or type a new one.",
      },
      { key: "estimatedHours", label: "Estimated Hours", type: "number", step: 0.5, min: 0, default: 12 },
      { key: "callTime", label: "Call Time", type: "time" },
      { key: "wrapTime", label: "Wrap Time", type: "time" },
      { key: "weather", label: "Weather", type: "text", placeholder: "Clear, 18°C" },
      { key: "scenes", label: "Scenes", type: "multiselect", optionsFrom: "scenes", wide: true },
    ],
    fromForm: (v, prev) => ({ ...v, banners: prev?.banners ?? [] }),
  },

  // ----------------------------------------------------------
  budgetLines: {
    singular: "Budget Line",
    idPrefix: "bl",
    entity: "purchase_order",
    label: (r) => `${r.code} ${r.description}`,
    fields: [
      { key: "code", label: "Account Code", type: "text", required: true, placeholder: "1100" },
      { key: "category", label: "Category", type: "text", required: true, placeholder: "Above the Line" },
      { key: "subcategory", label: "Subcategory", type: "text" },
      { key: "department", label: "Department", type: "select", optionsFrom: "departments" },
      { key: "description", label: "Description", type: "text", required: true, wide: true },
      { key: "budgeted", label: "Budgeted", type: "number", step: 0.01, min: 0, default: 0 },
      { key: "committed", label: "Committed", type: "number", step: 0.01, min: 0, default: 0 },
      { key: "spent", label: "Spent", type: "number", step: 0.01, min: 0, default: 0 },
    ],
  },

  // ----------------------------------------------------------
  pettyCash: {
    singular: "Petty Cash Entry",
    idPrefix: "pc",
    entity: "purchase_order",
    label: (r) => `${r.description} (${r.amount})`,
    fields: [
      { key: "date", label: "Date", type: "date", required: true },
      { key: "amount", label: "Amount", type: "number", required: true, step: 0.01 },
      { key: "currency", label: "Currency", type: "text", default: "USD" },
      { key: "department", label: "Department", type: "select", optionsFrom: "departments", required: true },
      { key: "description", label: "Description", type: "text", required: true, wide: true },
      { key: "loggedBy", label: "Logged By", type: "select", optionsFrom: "crew" },
    ],
  },

  // ----------------------------------------------------------
  vfxShots: {
    singular: "VFX Shot",
    idPrefix: "shot",
    entity: "vfx_shot",
    label: (r) => r.shotNumber,
    fields: [
      { key: "shotNumber", label: "Shot Number", type: "text", required: true, placeholder: "042_010" },
      { key: "sceneId", label: "Scene", type: "select", optionsFrom: "scenes", required: true },
      { key: "description", label: "Description", type: "textarea", wide: true },
      {
        key: "complexity",
        label: "Complexity",
        type: "select",
        options: ["simple", "moderate", "complex"],
        default: "moderate",
      },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["bid", "awarded", "in_progress", "internal_review", "client_review", "final", "delivered"],
        default: "bid",
      },
      { key: "vendorId", label: "Vendor", type: "select", optionsFrom: "vfxVendors" },
      { key: "reviewRounds", label: "Review Rounds", type: "number", step: 1, min: 0, default: 2 },
      { key: "reviewsCompleted", label: "Reviews Completed", type: "number", step: 1, min: 0, default: 0 },
      { key: "plateDeliveryDate", label: "Plate Delivery", type: "date" },
      { key: "finalDueDate", label: "Final Due", type: "date" },
    ],
  },

  // ----------------------------------------------------------
  vfxVendors: {
    singular: "VFX Vendor",
    idPrefix: "vendor",
    entity: "vfx_shot",
    label: (r) => r.name,
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "contact", label: "Contact", type: "text", placeholder: "name@studio.com" },
      { key: "city", label: "City", type: "text" },
      { key: "onTimePercent", label: "On-Time %", type: "number", step: 1, min: 0, default: 100 },
    ],
    fromForm: (v, prev) => ({ ...v, assignedShots: prev?.assignedShots ?? [] }),
  },

  // ----------------------------------------------------------
  frequencyPlan: {
    singular: "Frequency",
    idPrefix: "freq",
    entity: "frequency",
    label: (r) => `${r.device} @ ${r.frequencyMHz} MHz`,
    fields: [
      { key: "shootDay", label: "Shoot Day", type: "select", optionsFrom: "shootDays", required: true },
      {
        key: "location",
        label: "Location",
        type: "combo",
        optionsFrom: "locations",
        required: true,
        help: "Pick a known location or type a new one.",
      },
      { key: "device", label: "Device", type: "text", required: true, placeholder: "Wireless mic A" },
      { key: "frequencyMHz", label: "Frequency (MHz)", type: "number", required: true, step: 0.001, min: 0 },
      { key: "powerMW", label: "Power (mW)", type: "number", step: 1, min: 0, default: 50 },
      { key: "channel", label: "Channel", type: "text", required: true, placeholder: "CH 38" },
      { key: "notes", label: "Notes", type: "textarea", wide: true },
    ],
  },

  // ----------------------------------------------------------
  rfEquipment: {
    singular: "RF Device",
    idPrefix: "rf",
    entity: "rf_equipment",
    label: (r) => `${r.type} ${r.model}`,
    fields: [
      { key: "type", label: "Type", type: "text", required: true, placeholder: "Wireless TX / IFB / Video TX" },
      { key: "model", label: "Model", type: "text", required: true },
      { key: "serial", label: "Serial", type: "text", required: true },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["available", "assigned", "maintenance"],
        default: "available",
      },
      { key: "assignedShootDay", label: "Assigned Day", type: "select", optionsFrom: "shootDays" },
    ],
  },

  // ----------------------------------------------------------
  cameraKits: {
    singular: "Camera Kit",
    idPrefix: "kit",
    entity: "shoot_day",
    label: (r) => r.name,
    fields: [
      { key: "name", label: "Kit Name", type: "text", required: true, placeholder: "A-Cam Alexa + Zooms" },
      { key: "assignedShootDay", label: "Assigned Day", type: "select", optionsFrom: "shootDays" },
      {
        key: "items",
        label: "Items",
        type: "tags",
        wide: true,
        help: "One item per line.",
        default: [],
      },
    ],
  },

  // ----------------------------------------------------------
  equipmentCheckouts: {
    singular: "Checkout",
    idPrefix: "co",
    entity: "shoot_day",
    label: (r) => `${r.item} → ${r.checkedOutBy}`,
    fields: [
      { key: "item", label: "Item", type: "text", required: true },
      { key: "checkedOutBy", label: "Checked Out By", type: "select", optionsFrom: "crew", required: true },
      { key: "checkoutAt", label: "Checked Out At", type: "date", required: true },
      { key: "returnAt", label: "Returned At", type: "date" },
      { key: "condition", label: "Condition", type: "text", placeholder: "Good / Scuffed / Damaged" },
    ],
  },

  // ----------------------------------------------------------
  checklists: {
    singular: "Checklist",
    idPrefix: "cl",
    entity: "shoot_day",
    label: (r) => r.title,
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "shootDay", label: "Shoot Day", type: "select", optionsFrom: "shootDays" },
      {
        key: "items",
        label: "Items",
        type: "tags",
        wide: true,
        help: "One item per line. Existing tick state is preserved.",
        default: [],
      },
    ],
    // Stored items are ChecklistItem objects; the form edits plain labels.
    toForm: (r) => ({ ...r, items: (r.items ?? []).map((i: any) => i.label) }),
    fromForm: (v, prev) => {
      const existing: any[] = prev?.items ?? [];
      return {
        ...v,
        items: (v.items as string[]).map((label) => {
          const match = existing.find((i) => i.label === label);
          return match ?? { id: `${Date.now()}-${label}`, label, done: false };
        }),
      };
    },
  },

  // ----------------------------------------------------------
  artElements: {
    singular: "Art Element",
    idPrefix: "art",
    entity: "art_element",
    label: (r) => r.name,
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      {
        key: "category",
        label: "Category",
        type: "select",
        options: ["wardrobe", "prop", "set_dressing", "makeup"],
        default: "prop",
      },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["needed", "sourced", "in_progress", "fitting", "ready"],
        default: "needed",
      },
      { key: "characterName", label: "Character", type: "select", optionsFrom: "cast" },
      { key: "cost", label: "Cost", type: "number", step: 0.01, min: 0 },
      { key: "sceneIds", label: "Scenes", type: "multiselect", optionsFrom: "scenes", wide: true },
      { key: "notes", label: "Notes", type: "textarea", wide: true },
    ],
  },

  // ----------------------------------------------------------
  continuityPhotos: {
    singular: "Continuity Photo",
    idPrefix: "cp",
    entity: "art_element",
    label: (r) => r.caption || r.fileId,
    fields: [
      { key: "sceneId", label: "Scene", type: "select", optionsFrom: "scenes", required: true },
      { key: "fileId", label: "File Reference", type: "text", required: true },
      { key: "takenAt", label: "Taken At", type: "date", required: true },
      { key: "caption", label: "Caption", type: "text", wide: true },
    ],
  },
};

/** Blank form values for a new record of this collection. */
export function defaultValues(collection: RecordCollection): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of SCHEMAS[collection].fields) {
    if (f.default !== undefined) out[f.key] = f.default;
    else if (f.type === "multiselect" || f.type === "tags") out[f.key] = [];
    else if (f.type === "checkbox") out[f.key] = false;
    else out[f.key] = "";
  }
  return out;
}

/** Returns a map of field key -> error message. Empty when valid. */
export function validate(
  collection: RecordCollection,
  values: Record<string, any>
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of SCHEMAS[collection].fields) {
    if (!f.required) continue;
    const v = values[f.key];
    const empty =
      v === "" || v === undefined || v === null || (Array.isArray(v) && v.length === 0);
    if (empty) errors[f.key] = `${f.label} is required`;
  }
  return errors;
}

/** Compile-time guard: every RecordCollection must be a real ProductionData array key. */
type _AssertCollectionsExist = RecordCollection extends keyof ProductionData ? true : never;
const _check: _AssertCollectionsExist = true;
void _check;
