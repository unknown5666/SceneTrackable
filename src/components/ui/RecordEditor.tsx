import React, { useCallback, useId, useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useStore, canWrite } from "@/state/store";
import { useLocationNames } from "@/lib/locations";
import {
  SCHEMAS,
  defaultValues,
  validate,
  DEPARTMENTS,
  type FieldSpec,
  type OptionSource,
  type RecordCollection,
} from "@/data/schemas";
import { Modal } from "./Modal";
import { Button } from "./Button";

interface Opt {
  value: string;
  label: string;
}

/** Resolves the option list for a field that pulls from live store data. */
function useOptions(source: OptionSource | undefined): Opt[] {
  const scenes = useStore((s) => s.scenes);
  const shootDays = useStore((s) => s.shootDays);
  const cast = useStore((s) => s.cast);
  const crew = useStore((s) => s.crew);
  const vfxVendors = useStore((s) => s.vfxVendors);
  const locations = useLocationNames();

  return useMemo(() => {
    switch (source) {
      case "locations":
        return locations.map((l) => ({ value: l, label: l }));
      case "scenes":
        return scenes.map((s) => ({ value: s.id, label: `Sc. ${s.number} — ${s.location}` }));
      case "shootDays":
        return shootDays.map((d) => ({
          value: String(d.dayNumber),
          label: `Day ${d.dayNumber} — ${d.location}`,
        }));
      case "cast":
        return cast.map((c) => ({ value: c.role, label: `${c.role} (${c.name})` }));
      case "crew":
        return crew.map((c) => ({ value: c.id, label: `${c.name} — ${c.role}` }));
      case "vfxVendors":
        return vfxVendors.map((v) => ({ value: v.id, label: v.name }));
      case "departments":
        return DEPARTMENTS.map((d) => ({ value: d, label: d }));
      default:
        return [];
    }
  }, [source, scenes, shootDays, cast, crew, vfxVendors, locations]);
}

function Field({
  spec,
  value,
  error,
  onChange,
}: {
  spec: FieldSpec;
  value: any;
  error?: string;
  onChange: (v: unknown) => void;
}) {
  const dynamic = useOptions(spec.optionsFrom);
  const listId = useId();
  const options: Opt[] = spec.options
    ? spec.options.map((o) => ({ value: o, label: o.replace(/_/g, " ") }))
    : dynamic;

  const control = () => {
    switch (spec.type) {
      case "combo":
        return (
          <>
            <input
              type="text"
              list={listId}
              className="w-full"
              value={value ?? ""}
              placeholder={spec.placeholder}
              onChange={(e) => onChange(e.target.value)}
            />
            <datalist id={listId}>
              {options.map((o) => (
                <option key={o.value} value={o.value} />
              ))}
            </datalist>
          </>
        );

      case "textarea":
        return (
          <textarea
            className="w-full min-h-[72px]"
            value={value ?? ""}
            placeholder={spec.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case "number":
        return (
          <input
            type="number"
            className="w-full"
            step={spec.step}
            min={spec.min}
            value={value ?? ""}
            placeholder={spec.placeholder}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          />
        );

      case "date":
        return (
          <input
            type="date"
            className="w-full"
            value={typeof value === "string" ? value.slice(0, 10) : ""}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case "time":
        return (
          <input
            type="time"
            className="w-full"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case "checkbox":
        return (
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
          />
        );

      case "select":
        return (
          <select
            className="w-full"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">—</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );

      case "multiselect": {
        const selected: string[] = Array.isArray(value) ? value : [];
        return (
          <div className="max-h-[140px] overflow-y-auto rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-2 space-y-1">
            {options.length === 0 && (
              <div className="text-xs text-[var(--text-muted)] px-1 py-2">
                Nothing to choose from yet.
              </div>
            )}
            {options.map((o) => (
              <label
                key={o.value}
                className="flex items-center gap-2 text-sm cursor-pointer px-1 py-0.5 rounded hover:bg-[var(--bg-surface-hover)]"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...selected, o.value]
                        : selected.filter((v) => v !== o.value)
                    )
                  }
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        );
      }

      case "tags":
        return (
          <textarea
            className="w-full min-h-[92px] font-mono text-xs"
            value={(Array.isArray(value) ? value : []).join("\n")}
            placeholder={spec.placeholder}
            onChange={(e) =>
              onChange(
                e.target.value
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean)
              )
            }
          />
        );

      default:
        return (
          <input
            type="text"
            className="w-full"
            value={value ?? ""}
            placeholder={spec.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        );
    }
  };

  return (
    <div className={spec.wide ? "col-span-2" : ""}>
      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
        {spec.label}
        {spec.required && <span className="text-[var(--color-danger)] ml-0.5">*</span>}
      </label>
      {control()}
      {spec.help && !error && (
        <div className="text-[11px] text-[var(--text-muted)] mt-1">{spec.help}</div>
      )}
      {error && (
        <div className="text-[11px] text-[var(--color-danger)] mt-1">{error}</div>
      )}
    </div>
  );
}

/**
 * Generic add/edit modal for any schema-backed collection.
 * Prefer the useRecordEditor() hook over mounting this directly.
 */
export function RecordFormModal({
  collection,
  editingId,
  open,
  onClose,
}: {
  collection: RecordCollection;
  editingId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const schema = SCHEMAS[collection];
  const rows = useStore((s) => s[collection] as { id: string }[]);
  const addRecord = useStore((s) => s.addRecord);
  const updateRecord = useStore((s) => s.updateRecord);

  const existing = editingId ? rows.find((r) => r.id === editingId) : undefined;

  const initial = useMemo(() => {
    if (!existing) return defaultValues(collection);
    const rec = schema.toForm ? schema.toForm(existing) : existing;
    return { ...defaultValues(collection), ...rec };
  }, [existing, collection, schema]);

  const [values, setValues] = useState<Record<string, any>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formKey, setFormKey] = useState("");

  // Reset the form whenever the modal targets a different record.
  const key = `${collection}:${editingId ?? "new"}:${open}`;
  if (key !== formKey) {
    setFormKey(key);
    setValues(initial);
    setErrors({});
  }

  const submit = () => {
    const errs = validate(collection, values);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    // Drop blank optionals so we store `undefined` rather than "".
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v === "") continue;
      clean[k] = v;
    }
    // Numeric shoot-day references come back from <select> as strings.
    for (const f of schema.fields) {
      if (f.optionsFrom === "shootDays" && clean[f.key] !== undefined) {
        clean[f.key] = Number(clean[f.key]);
      }
    }
    if (editingId) updateRecord(collection, editingId, clean);
    else addRecord(collection, clean);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`${editingId ? "Edit" : "Add"} ${schema.singular}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            {editingId ? "Save Changes" : `Add ${schema.singular}`}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        {schema.fields.map((f) => (
          <Field
            key={f.key}
            spec={f}
            value={values[f.key]}
            error={errors[f.key]}
            onChange={(v) => {
              setValues((prev) => ({ ...prev, [f.key]: v }));
              // Clear this field's error as soon as the user addresses it.
              setErrors((prev) => {
                if (!prev[f.key]) return prev;
                const { [f.key]: _, ...rest } = prev;
                return rest;
              });
            }}
          />
        ))}
      </div>
    </Modal>
  );
}

/**
 * Which page's permission level governs each collection. Every record-driven
 * page goes through this hook, so gating here is what makes a "read" role
 * genuinely read-only rather than merely politely asked not to edit.
 */
const COLLECTION_PAGE: Record<RecordCollection, string> = {
  locations: "locations",
  shootDays: "schedule",
  budgetLines: "budget",
  pettyCash: "budget",
  vfxShots: "vfx",
  vfxVendors: "vfx",
  frequencyPlan: "rf",
  rfEquipment: "rf",
  cameraKits: "camera",
  equipmentCheckouts: "camera",
  checklists: "camera",
  artElements: "art",
  continuityPhotos: "art",
};

export interface RecordEditor {
  /** Whether the current role may change this collection at all. */
  canWrite: boolean;
  /** Open the modal to create a new record. */
  openNew: () => void;
  /** Open the modal to edit an existing record. */
  openEdit: (id: string) => void;
  /** Delete a record after confirming. */
  remove: (id: string) => void;
  /** "Add <Singular>" button — drop into a page/card header. */
  AddButton: (props: { size?: "sm" | "md"; label?: string }) => JSX.Element;
  /** Edit + delete buttons for a table row. */
  RowActions: (props: { id: string }) => JSX.Element;
  /** Mount once per page; renders the add/edit modal. */
  modal: JSX.Element;
}

/**
 * Wires a page up to the generic entry UI for one collection.
 *
 *   const ed = useRecordEditor("frequencyPlan");
 *   <ed.AddButton />           // header
 *   <ed.RowActions id={f.id}/> // per row
 *   {ed.modal}                 // once, anywhere in the page
 */
export function useRecordEditor(collection: RecordCollection): RecordEditor {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const deleteRecord = useStore((s) => s.deleteRecord);
  const writable = useStore((s) => canWrite(s, COLLECTION_PAGE[collection]));
  const schema = SCHEMAS[collection];

  const openNew = useCallback(() => {
    if (!writable) return;
    setEditingId(null);
    setOpen(true);
  }, [writable]);

  const openEdit = useCallback(
    (id: string) => {
      if (!writable) return;
      setEditingId(id);
      setOpen(true);
    },
    [writable]
  );

  const remove = useCallback(
    (id: string) => {
      if (!writable) return;
      if (confirm(`Delete this ${schema.singular.toLowerCase()}? This cannot be undone.`)) {
        deleteRecord(collection, id);
      }
    },
    [collection, deleteRecord, schema.singular, writable]
  );

  // Memoised so they keep a stable component identity across renders —
  // otherwise React remounts every button on each parent render.
  const AddButton = useMemo(
    () =>
      function AddButton({ size = "sm", label }: { size?: "sm" | "md"; label?: string }) {
        if (!writable) return <></>;
        return (
          <Button size={size} variant="primary" leftIcon={<Plus size={14} />} onClick={openNew}>
            {label ?? `Add ${schema.singular}`}
          </Button>
        );
      },
    [openNew, schema.singular, writable]
  );

  const RowActions = useMemo(
    () =>
      function RowActions({ id }: { id: string }) {
        if (!writable) return <></>;
        return (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => openEdit(id)} aria-label="Edit">
              <Pencil size={14} />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => remove(id)} aria-label="Delete">
              <Trash2 size={14} />
            </Button>
          </div>
        );
      },
    [openEdit, remove, writable]
  );

  const onClose = useCallback(() => setOpen(false), []);

  return {
    canWrite: writable,
    openNew,
    openEdit,
    remove,
    AddButton,
    RowActions,
    modal: (
      <RecordFormModal
        collection={collection}
        editingId={editingId}
        open={open}
        onClose={onClose}
      />
    ),
  };
}
