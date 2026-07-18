import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Modal } from "./Modal";
import { Badge } from "./Badge";
import { EquipmentImage } from "./EquipmentImage";
import { CATEGORY_LABELS, type EquipmentPreset } from "@/data/equipment-presets";

/**
 * A searchable grid of catalog presets. Selecting one hands the whole preset
 * back to the caller, which prefills its normal record modal — the catalog
 * never writes a record itself.
 */
export function CatalogPicker({
  open,
  onClose,
  presets,
  title = "Add from catalog",
  subtitle = "Pick a make and model — its specs prefill the record.",
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  presets: EquipmentPreset[];
  title?: string;
  subtitle?: string;
  onPick: (preset: EquipmentPreset) => void;
}) {
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return presets;
    return presets.filter((p) =>
      `${p.manufacturer} ${p.model} ${p.specs} ${CATEGORY_LABELS[p.category]}`
        .toLowerCase()
        .includes(q)
    );
  }, [presets, query]);

  return (
    <Modal open={open} onClose={onClose} size="lg" title={title} subtitle={subtitle}>
      <div className="space-y-3">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
          />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search make, model or spec…"
            className="w-full pl-8"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[52vh] overflow-y-auto pr-0.5">
          {shown.length === 0 && (
            <div className="col-span-full text-center text-sm text-[var(--text-muted)] py-8">
              Nothing in the catalog matches “{query}”.
            </div>
          )}
          {shown.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onPick(p);
                setQuery("");
              }}
              className="flex items-start gap-3 p-2.5 text-left rounded-lg border border-[var(--border-default)] hover:border-[var(--accent-blue)] hover:bg-[var(--bg-surface-hover)] transition-colors"
            >
              <EquipmentImage presetId={p.id} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                    {p.model}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5 mt-0.5">
                  <Badge tone="muted">{p.manufacturer}</Badge>
                  <span className="text-[var(--text-muted)]">{CATEGORY_LABELS[p.category]}</span>
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mt-1 line-clamp-2">{p.specs}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
