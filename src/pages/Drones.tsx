import React, { useMemo, useState } from "react";
import { Plane, LayoutGrid, DollarSign, ShieldCheck, Check } from "lucide-react";
import { useStore } from "@/state/store";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useRecordEditor } from "@/components/ui/RecordEditor";
import { CatalogPicker } from "@/components/ui/CatalogPicker";
import { EquipmentImage } from "@/components/ui/EquipmentImage";
import { DRONE_PRESETS, type EquipmentPreset } from "@/data/equipment-presets";
import { formatCurrency } from "@/lib/utils";
import type { Drone } from "@/types";

const REG_TONE: Record<NonNullable<Drone["regStatus"]>, "success" | "warning" | "muted"> = {
  registered: "success",
  pending: "warning",
  not_required: "muted",
};

const REG_LABEL: Record<NonNullable<Drone["regStatus"]>, string> = {
  registered: "Registered",
  pending: "Reg. pending",
  not_required: "No reg. needed",
};

const STATUS_TONE = (s: Drone["status"]) =>
  s === "available" ? ("success" as const) : s === "assigned" ? ("info" as const) : ("danger" as const);

/** Aerial day-rate cost of a drone that is booked to a day (drone + operator). */
function droneDayCost(d: Drone): number {
  if (!d.assignedShootDay) return 0;
  return (d.droneRatePerDay ?? 0) + (d.operatorRatePerDay ?? 0);
}

export function Drones() {
  const drones = useStore((s) => s.drones);
  const shootDays = useStore((s) => s.shootDays);
  const production = useStore((s) => s.production);
  const budgetLines = useStore((s) => s.budgetLines);
  const addRecord = useStore((s) => s.addRecord);
  const updateRecord = useStore((s) => s.updateRecord);
  const ed = useRecordEditor("drones");

  const [catalogOpen, setCatalogOpen] = useState(false);

  const aerialTotal = useMemo(() => drones.reduce((sum, d) => sum + droneDayCost(d), 0), [drones]);
  const assignedCount = drones.filter((d) => d.assignedShootDay).length;

  const addFromPreset = (p: EquipmentPreset) => {
    setCatalogOpen(false);
    ed.openWith({
      manufacturer: p.manufacturer,
      model: p.model,
      weightGrams: p.weightGrams,
      // Sub-250g drones typically need no registration; heavier ones do.
      regStatus: (p.weightGrams ?? 0) >= 250 ? "pending" : "not_required",
      status: "available",
      presetId: p.id,
      notes: p.specs,
    });
  };

  // A drone's day booking and its live status move together.
  const setAssignedDay = (d: Drone, day: number | null) => {
    updateRecord("drones", d.id, {
      assignedShootDay: day ?? undefined,
      status: day ? "assigned" : d.status === "assigned" ? "available" : d.status,
    });
  };

  const setStatus = (d: Drone, status: Drone["status"]) => {
    updateRecord("drones", d.id, {
      status,
      assignedShootDay: status === "maintenance" ? undefined : d.assignedShootDay,
    });
  };

  const sendToBudget = () => {
    const existing = budgetLines.find(
      (b) => b.department === "camera" && b.subcategory === "Aerial"
    );
    if (existing) {
      updateRecord("budgetLines", existing.id, { ...existing, budgeted: aerialTotal });
    } else {
      addRecord("budgetLines", {
        code: "1490",
        category: "Camera",
        subcategory: "Aerial",
        department: "camera",
        description: "Aerial / drone unit (day rates)",
        budgeted: aerialTotal,
        committed: 0,
        spent: 0,
      });
    }
  };

  const catalog = (
    <CatalogPicker
      open={catalogOpen}
      onClose={() => setCatalogOpen(false)}
      presets={DRONE_PRESETS}
      title="Drone catalog"
      subtitle="DJI-led presets with weight and camera specs — pick one to prefill the record."
      onPick={addFromPreset}
    />
  );

  const header = (
    <div className="flex items-start justify-between gap-3 mb-6">
      <div>
        <div className="section-header">Camera / Aerial</div>
        <div className="page-title mt-1">Drones</div>
        <div className="text-xs text-[var(--text-muted)] mt-1">
          {drones.length} {drones.length === 1 ? "aircraft" : "aircraft"} · {assignedCount} booked
        </div>
      </div>
      {ed.canWrite && (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setCatalogOpen(true)}>
            <LayoutGrid size={14} /> Add from catalog
          </Button>
          <ed.AddButton label="Add Drone" />
        </div>
      )}
    </div>
  );

  if (drones.length === 0) {
    return (
      <div className="max-w-[1400px] mx-auto">
        {header}
        <Card padding="lg">
          <EmptyState
            icon={<Plane size={48} />}
            title="No drones logged"
            subtitle="Add your aerial units — operators, licences and day rates — and book them onto shoot days. Start from the catalog for DJI presets."
            cta={
              ed.canWrite ? (
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => setCatalogOpen(true)}>
                    <LayoutGrid size={14} /> Add from catalog
                  </Button>
                  <ed.AddButton size="md" label="Add First Drone" />
                </div>
              ) : undefined
            }
          />
        </Card>
        {ed.modal}
        {catalog}
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      {header}

      {/* Aerial cost summary + budget tie-in */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <DollarSign size={16} className="text-[var(--text-muted)]" />
            <div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                {formatCurrency(aerialTotal, production.currency)}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Aerial day-rate total across {assignedCount} booked{" "}
                {assignedCount === 1 ? "unit" : "units"} (drone + operator).
              </div>
            </div>
          </div>
          {ed.canWrite && (
            <Button variant="secondary" size="sm" onClick={sendToBudget} disabled={aerialTotal === 0}>
              <Check size={14} /> Send to budget (Camera · Aerial)
            </Button>
          )}
        </div>
      </Card>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="pos-table">
            <thead>
              <tr>
                <th className="w-[52px]"></th>
                <th>Model</th>
                <th>Weight</th>
                <th>Registration</th>
                <th>Operator</th>
                <th className="text-right">Day rate</th>
                <th>Status</th>
                <th>Booked</th>
                <th className="w-[90px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {drones.map((d) => (
                <tr key={d.id}>
                  <td>
                    <EquipmentImage
                      imageUrl={d.imageUrl}
                      presetId={d.presetId}
                      manufacturer={d.manufacturer}
                      silhouette="quadcopter"
                      size={40}
                    />
                  </td>
                  <td className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {d.manufacturer ? `${d.manufacturer} ` : ""}
                      {d.model}
                      {d.presetId && <Badge tone="ai">Catalog</Badge>}
                    </div>
                  </td>
                  <td className="text-xs text-[var(--text-secondary)]">
                    {d.weightGrams ? `${d.weightGrams} g` : "—"}
                  </td>
                  <td>
                    {d.regStatus ? (
                      <Badge tone={REG_TONE[d.regStatus]} dot>
                        {REG_LABEL[d.regStatus]}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-xs">
                    {d.operatorName ? (
                      <div>
                        <div className="text-[var(--text-primary)]">{d.operatorName}</div>
                        {d.operatorLicense && (
                          <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                            <ShieldCheck size={9} /> {d.operatorLicense}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                  <td className="text-right text-xs">
                    {formatCurrency((d.droneRatePerDay ?? 0) + (d.operatorRatePerDay ?? 0), production.currency)}
                  </td>
                  <td>
                    {ed.canWrite ? (
                      <select
                        className="text-xs py-1"
                        value={d.status}
                        onChange={(e) => setStatus(d, e.target.value as Drone["status"])}
                      >
                        <option value="available">available</option>
                        <option value="assigned">assigned</option>
                        <option value="maintenance">maintenance</option>
                      </select>
                    ) : (
                      <Badge tone={STATUS_TONE(d.status)}>{d.status}</Badge>
                    )}
                  </td>
                  <td>
                    {d.status === "maintenance" ? (
                      <span className="text-[var(--text-muted)]">—</span>
                    ) : ed.canWrite ? (
                      <select
                        className="text-xs py-1"
                        value={d.assignedShootDay ?? ""}
                        onChange={(e) =>
                          setAssignedDay(d, e.target.value === "" ? null : Number(e.target.value))
                        }
                      >
                        <option value="">Unbooked</option>
                        {shootDays.map((day) => (
                          <option key={day.id} value={day.dayNumber}>
                            Day {day.dayNumber} — {day.location}
                          </option>
                        ))}
                      </select>
                    ) : d.assignedShootDay ? (
                      `Day ${d.assignedShootDay}`
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <ed.RowActions id={d.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {ed.modal}
      {catalog}
    </div>
  );
}
