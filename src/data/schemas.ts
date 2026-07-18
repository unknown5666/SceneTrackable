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
  | "drones"
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
  | "tags"
  /** An https URL — validated, empty allowed. */
  | "url"
  /** A URL or a small downscaled data-URI, with a file picker + preview. */
  | "image";

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
      {
        key: "mapUrl",
        label: "Map",
        type: "url",
        wide: true,
        placeholder: "Google Maps link (falls back to the address)",
        help: "A Maps URL or embed. Leave blank to map the address above.",
      },
      { key: "imageUrl", label: "Scout Photo", type: "image", wide: true },
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
        key: "locations",
        label: "Locations",
        type: "multiselect",
        optionsFrom: "locations",
        required: true,
        wide: true,
        help: "One or more — a day can span a company move between locations.",
        default: [],
      },
      { key: "estimatedHours", label: "Estimated Hours", type: "number", step: 0.5, min: 0, default: 12 },
      { key: "callTime", label: "Call Time", type: "time" },
      { key: "wrapTime", label: "Wrap Time", type: "time" },
      { key: "weather", label: "Weather", type: "text", placeholder: "Clear, 18°C" },
      { key: "scenes", label: "Scenes", type: "multiselect", optionsFrom: "scenes", wide: true },
    ],
    // A day can span several locations, but `location` (the first) is still
    // written for every old consumer; `dayLocations()` is the resolver new code
    // reads. `toForm` seeds the multiselect from a single-location legacy record.
    toForm: (r) => ({
      ...r,
      locations: r.locations?.length ? r.locations : r.location ? [r.location] : [],
    }),
    fromForm: (v, prev) => {
      const locations: string[] = Array.isArray(v.locations) ? v.locations.filter(Boolean) : [];
      return {
        ...v,
        locations,
        location: locations[0] ?? v.location ?? "",
        banners: prev?.banners ?? [],
      };
    },
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
      { key: "manufacturer", label: "Manufacturer", type: "text", placeholder: "Sennheiser" },
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
      { key: "imageUrl", label: "Photo", type: "image", wide: true },
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
      { key: "manufacturer", label: "Manufacturer", type: "text", placeholder: "ARRI" },
      { key: "assignedShootDay", label: "Assigned Day", type: "select", optionsFrom: "shootDays" },
      { key: "imageUrl", label: "Photo", type: "image", wide: true },
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
  drones: {
    singular: "Drone",
    idPrefix: "drone",
    entity: "drone",
    label: (r) => `${r.manufacturer ? `${r.manufacturer} ` : ""}${r.model}`,
    fields: [
      { key: "manufacturer", label: "Manufacturer", type: "text", placeholder: "DJI" },
      { key: "model", label: "Model", type: "text", required: true, placeholder: "Mavic 3 Pro" },
      { key: "serial", label: "Serial", type: "text" },
      { key: "weightGrams", label: "Weight (g)", type: "number", step: 1, min: 0 },
      {
        key: "regStatus",
        label: "Registration",
        type: "select",
        options: ["not_required", "registered", "pending"],
        default: "not_required",
      },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["available", "assigned", "maintenance"],
        default: "available",
      },
      { key: "assignedShootDay", label: "Assigned Day", type: "select", optionsFrom: "shootDays" },
      { key: "operatorName", label: "Operator", type: "text", placeholder: "Licensed pilot" },
      { key: "operatorLicense", label: "Operator License", type: "text", placeholder: "CAA / FAA #" },
      { key: "operatorRatePerDay", label: "Operator Rate / Day", type: "number", step: 0.01, min: 0 },
      { key: "droneRatePerDay", label: "Drone Rate / Day", type: "number", step: 0.01, min: 0 },
      { key: "imageUrl", label: "Photo", type: "image", wide: true },
      { key: "notes", label: "Notes", type: "textarea", wide: true },
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
      { key: "imageUrl", label: "Reference Photo", type: "image", wide: true },
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

/** A URL field's value is valid when empty, a data-URI, or an http(s) URL. */
function urlFieldError(label: string, type: FieldType, value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const v = value.trim();
  if (type === "image" && v.startsWith("data:image/")) return null;
  if (/^https?:\/\/.+/i.test(v)) return null;
  return `${label} must be a full URL (https://…)`;
}

/** Returns a map of field key -> error message. Empty when valid. */
export function validate(
  collection: RecordCollection,
  values: Record<string, any>
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of SCHEMAS[collection].fields) {
    const v = values[f.key];
    if (f.required) {
      const empty =
        v === "" || v === undefined || v === null || (Array.isArray(v) && v.length === 0);
      if (empty) {
        errors[f.key] = `${f.label} is required`;
        continue;
      }
    }
    if (f.type === "url" || f.type === "image") {
      const err = urlFieldError(f.label, f.type, v);
      if (err) errors[f.key] = err;
    }
  }
  return errors;
}

/** Compile-time guard: every RecordCollection must be a real ProductionData array key. */
type _AssertCollectionsExist = RecordCollection extends keyof ProductionData ? true : never;
const _check: _AssertCollectionsExist = true;
void _check;
