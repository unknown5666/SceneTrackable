import React, { useState } from "react";
import { Radio, Wifi, AlertCircle, Check } from "lucide-react";
import { useStore } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { StatCard } from "@/components/ui/StatCard";

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

  const grouped = new Map<number, typeof frequencyPlan>();
  for (const f of frequencyPlan) {
    const arr = grouped.get(f.shootDay) ?? [];
    arr.push(f);
    grouped.set(f.shootDay, arr);
  }

  return (
    <div className="space-y-4">
      {Array.from(grouped.entries()).map(([dayNum, entries]) => {
        const day = shootDays.find((d) => d.dayNumber === dayNum);
        return (
          <Card key={dayNum} padding="none">
            <div className="p-4 border-b border-[var(--border-default)]">
              <div className="flex items-center gap-3">
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  Day {dayNum}
                </div>
                <Badge tone="muted">{entries[0].location}</Badge>
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
                  </tr>
                </thead>
                <tbody>
                  {entries.map((f) => (
                    <tr key={f.id}>
                      <td className="font-medium">{f.device}</td>
                      <td className="text-right font-mono text-xs">{f.frequencyMHz.toFixed(3)}</td>
                      <td className="text-right">{f.powerMW}</td>
                      <td><Badge tone="info">{f.channel}</Badge></td>
                      <td className="text-xs text-[var(--text-secondary)]">{f.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function EquipmentList() {
  const rfEquipment = useStore((s) => s.rfEquipment);
  const assignToDay = useStore((s) => s.assignRFEquipmentToDay);

  const statusTone = (s: string) => {
    switch (s) {
      case "available": return "success" as const;
      case "assigned": return "info" as const;
      case "maintenance": return "danger" as const;
      default: return "muted" as const;
    }
  };

  return (
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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rfEquipment.map((e) => (
              <tr key={e.id}>
                <td className="font-medium">{e.type}</td>
                <td>{e.model}</td>
                <td className="font-mono text-xs text-[var(--text-secondary)]">{e.serial}</td>
                <td><Badge tone={statusTone(e.status)}>{e.status}</Badge></td>
                <td className="text-[var(--text-secondary)]">{e.assignedShootDay ? `Day ${e.assignedShootDay}` : "—"}</td>
                <td>
                  {e.status === "assigned" ? (
                    <Button size="sm" variant="ghost" onClick={() => assignToDay(e.id, null)}>
                      Release
                    </Button>
                  ) : e.status === "available" ? (
                    <Button size="sm" variant="secondary" onClick={() => assignToDay(e.id, 15)}>
                      Assign Day 15
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
