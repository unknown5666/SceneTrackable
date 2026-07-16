import React, { useState } from "react";
import { Camera, Check, Package, ClipboardList } from "lucide-react";
import { useStore } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { ProgressBar } from "@/components/ui/ProgressBar";
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
  const assignKit = useStore((s) => s.assignKitToDay);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {cameraKits.map((kit) => (
        <Card key={kit.id}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">{kit.name}</div>
              {kit.assignedShootDay && (
                <Badge tone="info" className="mt-1">Day {kit.assignedShootDay}</Badge>
              )}
            </div>
            <Camera size={16} className="text-[var(--text-muted)]" />
          </div>
          <div className="space-y-1.5">
            {kit.items.map((item, i) => (
              <div key={i} className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
                {item}
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            {kit.assignedShootDay ? (
              <Button size="sm" variant="ghost" onClick={() => assignKit(kit.id, null)}>
                Unassign
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => assignKit(kit.id, 15)}>
                Assign Day 15
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function PrepChecklists() {
  const checklists = useStore((s) => s.checklists);
  const toggleItem = useStore((s) => s.toggleChecklistItem);
  const currentUserId = useStore((s) => s.currentUserId);
  const crew = useStore((s) => s.crew);

  return (
    <div className="space-y-4">
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
    </div>
  );
}

function CheckoutLog() {
  const equipmentCheckouts = useStore((s) => s.equipmentCheckouts);
  const crew = useStore((s) => s.crew);

  return (
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
