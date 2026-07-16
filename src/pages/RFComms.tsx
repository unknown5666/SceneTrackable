import React, { useState } from "react";
import { Radio, Wifi } from "lucide-react";
import { useStore } from "@/state/store";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { useRecordEditor } from "@/components/ui/RecordEditor";

export function RFComms() {
  const [tab, setTab] = useState("freq");

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="mb-4">
        <div className="section-header">RF / Comms</div>
        <div className="page-title mt-1">Frequency & Equipment</div>
      </div>

      <Tabs
        tabs={[
          { id: "freq", label: "Frequency Plan" },
          { id: "equipment", label: "Equipment" },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-6"
      />

      {tab === "freq" ? <FreqPlan /> : <EquipmentList />}
    </div>
  );
}

function FreqPlan() {
  const frequencyPlan = useStore((s) => s.frequencyPlan);
  const shootDays = useStore((s) => s.shootDays);
  const ed = useRecordEditor("frequencyPlan");

  const grouped = new Map<number, typeof frequencyPlan>();
  for (const f of frequencyPlan) {
    const arr = grouped.get(f.shootDay) ?? [];
    arr.push(f);
    grouped.set(f.shootDay, arr);
  }
  const days = Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--text-secondary)]">
          {frequencyPlan.length} {frequencyPlan.length === 1 ? "frequency" : "frequencies"} filed
          across {days.length} {days.length === 1 ? "day" : "days"}
        </div>
        <ed.AddButton />
      </div>

      {days.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Wifi size={48} />}
            title="No frequencies filed yet"
            subtitle="Log each transmitter with its frequency, power and channel so you can spot conflicts before the day."
            cta={<ed.AddButton size="md" label="Add First Frequency" />}
          />
        </Card>
      ) : (
        days.map(([dayNum, entries]) => {
          const day = shootDays.find((d) => d.dayNumber === dayNum);
          return (
            <Card key={dayNum} padding="none">
              <div className="p-4 border-b border-[var(--border-default)]">
                <div className="flex items-center gap-3">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    Day {dayNum}
                  </div>
                  <Badge tone="muted">{day?.location ?? entries[0].location}</Badge>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="pos-table text-sm">
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th className="text-right">Frequency (MHz)</th>
                      <th className="text-right">Power (mW)</th>
                      <th>Channel</th>
                      <th>Notes</th>
                      <th className="w-[90px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((f) => (
                      <tr key={f.id}>
                        <td className="font-medium">{f.device}</td>
                        <td className="text-right font-mono text-xs">
                          {f.frequencyMHz.toFixed(3)}
                        </td>
                        <td className="text-right">{f.powerMW}</td>
                        <td>
                          <Badge tone="info">{f.channel}</Badge>
                        </td>
                        <td className="text-xs text-[var(--text-secondary)]">{f.notes ?? "—"}</td>
                        <td>
                          <ed.RowActions id={f.id} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })
      )}

      {ed.modal}
    </div>
  );
}

function EquipmentList() {
  const rfEquipment = useStore((s) => s.rfEquipment);
  const shootDays = useStore((s) => s.shootDays);
  const assignToDay = useStore((s) => s.assignRFEquipmentToDay);
  const ed = useRecordEditor("rfEquipment");

  const statusTone = (s: string) => {
    switch (s) {
      case "available":
        return "success" as const;
      case "assigned":
        return "info" as const;
      case "maintenance":
        return "danger" as const;
      default:
        return "muted" as const;
    }
  };

  if (rfEquipment.length === 0) {
    return (
      <>
        <Card>
          <EmptyState
            icon={<Radio size={48} />}
            title="No RF equipment logged"
            subtitle="Add your transmitters, IFBs and video links to track what's out, what's free, and what's in the shop."
            cta={<ed.AddButton size="md" label="Add First Device" />}
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
          {rfEquipment.length} {rfEquipment.length === 1 ? "device" : "devices"}
        </div>
        <ed.AddButton label="Add Device" />
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="pos-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Model</th>
                <th>Serial</th>
                <th>Status</th>
                <th>Assigned Day</th>
                <th className="w-[90px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rfEquipment.map((e) => (
                <tr key={e.id}>
                  <td className="font-medium">{e.type}</td>
                  <td>{e.model}</td>
                  <td className="font-mono text-xs text-[var(--text-secondary)]">{e.serial}</td>
                  <td>
                    <Badge tone={statusTone(e.status)}>{e.status}</Badge>
                  </td>
                  <td>
                    {e.status === "maintenance" ? (
                      <span className="text-[var(--text-muted)]">—</span>
                    ) : (
                      <select
                        className="text-xs py-1"
                        value={e.assignedShootDay ?? ""}
                        onChange={(ev) =>
                          assignToDay(e.id, ev.target.value === "" ? null : Number(ev.target.value))
                        }
                      >
                        <option value="">Unassigned</option>
                        {shootDays.map((d) => (
                          <option key={d.id} value={d.dayNumber}>
                            Day {d.dayNumber} — {d.location}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    <ed.RowActions id={e.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {ed.modal}
    </div>
  );
}
