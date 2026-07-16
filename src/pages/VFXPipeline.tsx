import React, { useState } from "react";
import { Sparkles, ChevronRight, ExternalLink } from "lucide-react";
import { useStore } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, cn } from "@/lib/utils";
import type { VFXShotStatus } from "@/types";

const PIPELINE_COLUMNS: { id: VFXShotStatus; label: string; color: string }[] = [
  { id: "bid", label: "Bid", color: "var(--text-muted)" },
  { id: "awarded", label: "Awarded", color: "var(--accent-blue)" },
  { id: "in_progress", label: "In Progress", color: "var(--color-warning)" },
  { id: "internal_review", label: "Internal Review", color: "var(--color-ai)" },
  { id: "client_review", label: "Client Review", color: "var(--color-warning)" },
  { id: "final", label: "Final", color: "var(--color-success)" },
  { id: "delivered", label: "Delivered", color: "var(--color-success)" },
];

export function VFXPipeline() {
  const [tab, setTab] = useState("pipeline");

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="mb-4">
        <div className="section-header">VFX Pipeline</div>
        <div className="page-title mt-1">Shot Management</div>
      </div>

      <Tabs
        tabs={[
          { id: "pipeline", label: "Pipeline Board" },
          { id: "vendors", label: "Vendors" },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-6"
      />

      {tab === "pipeline" ? <PipelineBoard /> : <VendorList />}
    </div>
  );
}

function PipelineBoard() {
  const vfxShots = useStore((s) => s.vfxShots);
  const scenes = useStore((s) => s.scenes);
  const vfxVendors = useStore((s) => s.vfxVendors);
  const updateStatus = useStore((s) => s.updateShotStatus);

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3" style={{ minWidth: PIPELINE_COLUMNS.length * 200 }}>
        {PIPELINE_COLUMNS.map((col) => {
          const shots = vfxShots.filter((s) => s.status === col.id);
          return (
            <div key={col.id} className="flex-1 min-w-[180px]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: col.color }}
                  />
                  <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    {col.label}
                  </span>
                </div>
                <Badge tone="muted">{shots.length}</Badge>
              </div>
              <div className="space-y-2">
                {shots.map((shot) => {
                  const scene = scenes.find((s) => s.id === shot.sceneId);
                  const vendor = vfxVendors.find((v) => v.id === shot.vendorId);
                  const colIdx = PIPELINE_COLUMNS.findIndex((c) => c.id === shot.status);
                  const nextCol = PIPELINE_COLUMNS[colIdx + 1];

                  return (
                    <Card key={shot.id} padding="sm" className="group">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                          {shot.shotNumber}
                        </span>
                        <Badge
                          tone={
                            shot.complexity === "complex"
                              ? "danger"
                              : shot.complexity === "moderate"
                              ? "warning"
                              : "muted"
                          }
                        >
                          {shot.complexity}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-[var(--text-secondary)] line-clamp-2 mb-2">
                        {shot.description}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] mb-1">
                        Scene {scene?.number} · {vendor?.name ?? "Unassigned"}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        Reviews: {shot.reviewsCompleted}/{shot.reviewRounds}
                        {shot.finalDueDate && ` · Due ${formatDate(shot.finalDueDate)}`}
                      </div>
                      {nextCol && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => updateStatus(shot.id, nextCol.id)}
                        >
                          → {nextCol.label}
                        </Button>
                      )}
                    </Card>
                  );
                })}
                {shots.length === 0 && (
                  <div className="text-center text-[10px] text-[var(--text-muted)] py-6">
                    No shots
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VendorList() {
  const vfxVendors = useStore((s) => s.vfxVendors);
  const vfxShots = useStore((s) => s.vfxShots);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {vfxVendors.map((v) => {
        const shots = vfxShots.filter((s) => s.vendorId === v.id);
        const delivered = shots.filter((s) => s.status === "delivered").length;
        return (
          <Card key={v.id}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-base font-semibold text-[var(--text-primary)]">{v.name}</div>
                <div className="text-xs text-[var(--text-secondary)]">{v.city}</div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">{v.contact}</div>
              </div>
              <Badge tone={v.onTimePercent >= 90 ? "success" : v.onTimePercent >= 80 ? "warning" : "danger"}>
                {v.onTimePercent}% on-time
              </Badge>
            </div>
            <div className="text-sm text-[var(--text-secondary)]">
              {shots.length} shots assigned · {delivered} delivered
            </div>
          </Card>
        );
      })}
    </div>
  );
}
