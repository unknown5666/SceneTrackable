import React, { useState } from "react";
import { Camera, Check, Package, ClipboardList, LayoutGrid } from "lucide-react";
import { useStore } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { useRecordEditor } from "@/components/ui/RecordEditor";
import { CatalogPicker } from "@/components/ui/CatalogPicker";
import { EquipmentImage } from "@/components/ui/EquipmentImage";
import { CAMERA_PRESETS, type EquipmentPreset } from "@/data/equipment-presets";
import { formatDateTime, cn } from "@/lib/utils";

export function CameraPortal() {
  const [tab, setTab] = useState("kits");

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="mb-4">
        <div className="section-header">Camera / Technical</div>
        <div className="page-title mt-1">Equipment & Prep</div>
      </div>
      <Tabs
        tabs={[
          { id: "kits", label: "Kit Builder" },
          { id: "checklists", label: "Prep Checklists" },
          { id: "checkout", label: "Check-in/out Log" },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-6"
      />
      {tab === "kits" && <KitBuilder />}
      {tab === "checklists" && <PrepChecklists />}
      {tab === "checkout" && <CheckoutLog />}
    </div>
  );
}

function KitBuilder() {
  const cameraKits = useStore((s) => s.cameraKits);
  const shootDays = useStore((s) => s.shootDays);
  const assignKit = useStore((s) => s.assignKitToDay);
  const ed = useRecordEditor("cameraKits");
  const [catalogOpen, setCatalogOpen] = useState(false);

  const addFromPreset = (p: EquipmentPreset) => {
    setCatalogOpen(false);
    ed.openWith({
      name: `${p.manufacturer} ${p.model}`,
      manufacturer: p.manufacturer,
      items: [`${p.model} — ${p.specs}`],
      presetId: p.id,
    });
  };

  const catalogButton = ed.canWrite ? (
    <Button variant="secondary" size="sm" onClick={() => setCatalogOpen(true)}>
      <LayoutGrid size={14} /> Add from catalog
    </Button>
  ) : null;

  const catalog = (
    <CatalogPicker
      open={catalogOpen}
      onClose={() => setCatalogOpen(false)}
      presets={CAMERA_PRESETS}
      title="Camera catalog"
      subtitle="Pick a body, lens set or support — it becomes a kit you can add to."
      onPick={addFromPreset}
    />
  );

  if (cameraKits.length === 0) {
    return (
      <>
        <Card>
          <EmptyState
            icon={<Package size={48} />}
            title="No camera kits yet"
            subtitle="Build a kit list once, then assign it to the days it's needed. Start from the catalog for industry-standard bodies and glass."
            cta={
              <div className="flex items-center gap-2">
                {catalogButton}
                <ed.AddButton size="md" label="Add First Kit" />
              </div>
            }
          />
        </Card>
        {ed.modal}
        {catalog}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--text-secondary)]">
          {cameraKits.length} {cameraKits.length === 1 ? "kit" : "kits"}
        </div>
        <div className="flex items-center gap-2">
          {catalogButton}
          <ed.AddButton label="Add Kit" />
        </div>
      </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {cameraKits.map((kit) => (
        <Card key={kit.id}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-start gap-3 min-w-0">
              <EquipmentImage
                imageUrl={kit.imageUrl}
                presetId={kit.presetId}
                manufacturer={kit.manufacturer}
                size={44}
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{kit.name}</div>
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {kit.presetId && <Badge tone="ai">Catalog</Badge>}
                  {kit.assignedShootDay && <Badge tone="info">Day {kit.assignedShootDay}</Badge>}
                </div>
              </div>
            </div>
            <Camera size={16} className="text-[var(--text-muted)] shrink-0" />
          </div>
          <div className="space-y-1.5">
            {kit.items.map((item, i) => (
              <div key={i} className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
                {item}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <select
              className="text-xs py-1 flex-1"
              value={kit.assignedShootDay ?? ""}
              onChange={(e) =>
                assignKit(kit.id, e.target.value === "" ? null : Number(e.target.value))
              }
            >
              <option value="">Unassigned</option>
              {shootDays.map((d) => (
                <option key={d.id} value={d.dayNumber}>
                  Day {d.dayNumber} — {d.location}
                </option>
              ))}
            </select>
            <ed.RowActions id={kit.id} />
          </div>
        </Card>
      ))}
    </div>
      {ed.modal}
      {catalog}
    </div>
  );
}

function PrepChecklists() {
  const checklists = useStore((s) => s.checklists);
  const toggleItem = useStore((s) => s.toggleChecklistItem);
  const currentUserId = useStore((s) => s.currentUserId);
  const crew = useStore((s) => s.crew);
  const ed = useRecordEditor("checklists");

  if (checklists.length === 0) {
    return (
      <>
        <Card>
          <EmptyState
            icon={<ClipboardList size={48} />}
            title="No prep checklists yet"
            subtitle="Build a checklist per prep day so the whole department can tick items off together."
            cta={<ed.AddButton size="md" label="Add First Checklist" />}
          />
        </Card>
        {ed.modal}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--text-secondary)]">
          {checklists.length} {checklists.length === 1 ? "checklist" : "checklists"}
        </div>
        <ed.AddButton label="Add Checklist" />
      </div>
      {checklists.map((cl) => {
        const done = cl.items.filter((i) => i.done).length;
        const pct = cl.items.length ? (done / cl.items.length) * 100 : 0;
        return (
          <Card key={cl.id}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">{cl.title}</div>
                {cl.shootDay && (
                  <div className="text-xs text-[var(--text-muted)]">Day {cl.shootDay}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-secondary)]">{done}/{cl.items.length}</span>
                <div className="w-20">
                  <ProgressBar value={pct} tone={pct >= 100 ? "success" : pct > 50 ? "warning" : "danger"} height={4} />
                </div>
                <ed.RowActions id={cl.id} />
              </div>
            </div>
            <div className="space-y-1.5">
              {cl.items.map((item) => {
                const doneBy = item.doneBy ? crew.find((c) => c.id === item.doneBy) : null;
                return (
                  <label
                    key={item.id}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                      item.done
                        ? "bg-[rgba(34,197,94,0.05)]"
                        : "hover:bg-[var(--bg-surface-hover)]"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => toggleItem(cl.id, item.id, currentUserId)}
                      className="accent-[var(--color-success)]"
                    />
                    <div className="flex-1 min-w-0">
                      <span
                        className={cn(
                          "text-sm",
                          item.done
                            ? "text-[var(--text-muted)] line-through"
                            : "text-[var(--text-primary)]"
                        )}
                      >
                        {item.label}
                      </span>
                    </div>
                    {item.done && doneBy && (
                      <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                        {doneBy.name}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </Card>
        );
      })}
      {ed.modal}
    </div>
  );
}

function CheckoutLog() {
  const equipmentCheckouts = useStore((s) => s.equipmentCheckouts);
  const crew = useStore((s) => s.crew);
  const ed = useRecordEditor("equipmentCheckouts");

  if (equipmentCheckouts.length === 0) {
    return (
      <>
        <Card>
          <EmptyState
            icon={<Check size={48} />}
            title="Nothing checked out"
            subtitle="Log gear as it leaves the truck so you know what's out and who has it."
            cta={<ed.AddButton size="md" label="Log First Checkout" />}
          />
        </Card>
        {ed.modal}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--text-secondary)]">
          {equipmentCheckouts.filter((c) => !c.returnAt).length} out ·{" "}
          {equipmentCheckouts.length} total
        </div>
        <ed.AddButton label="Log Checkout" />
      </div>
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="pos-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Checked Out By</th>
              <th>Out</th>
              <th>Returned</th>
              <th>Condition</th>
              <th className="w-[90px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {equipmentCheckouts.map((e) => {
              const person = crew.find((c) => c.id === e.checkedOutBy);
              return (
                <tr key={e.id}>
                  <td className="font-medium">{e.item}</td>
                  <td>{person?.name ?? e.checkedOutBy}</td>
                  <td className="text-xs text-[var(--text-secondary)]">{formatDateTime(e.checkoutAt)}</td>
                  <td className="text-xs text-[var(--text-secondary)]">
                    {e.returnAt ? formatDateTime(e.returnAt) : <Badge tone="warning">Out</Badge>}
                  </td>
                  <td className="text-xs text-[var(--text-secondary)]">{e.condition ?? "—"}</td>
                  <td>
                    <ed.RowActions id={e.id} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
      {ed.modal}
    </div>
  );
}
