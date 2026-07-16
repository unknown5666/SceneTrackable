import React, { useState } from "react";
import { Palette, Eye } from "lucide-react";
import { useStore } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { formatCurrency, cn } from "@/lib/utils";
import type { ArtElementStatus } from "@/types";

const STATUS_ORDER: ArtElementStatus[] = ["needed", "sourced", "in_progress", "fitting", "ready"];

const STATUS_TONE: Record<ArtElementStatus, "danger" | "warning" | "info" | "success" | "muted"> = {
  needed: "danger",
  sourced: "warning",
  in_progress: "info",
  fitting: "warning",
  ready: "success",
};

export function ArtPortal() {
  const [tab, setTab] = useState("elements");

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="mb-4">
        <div className="section-header">Art / Wardrobe / Props</div>
        <div className="page-title mt-1">Element Tracking</div>
      </div>
      <Tabs
        tabs={[
          { id: "elements", label: "Element Tracker" },
          { id: "continuity", label: "Continuity Board" },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-6"
      />
      {tab === "elements" ? <ElementTracker /> : <ContinuityBoard />}
    </div>
  );
}

function ElementTracker() {
  const artElements = useStore((s) => s.artElements);
  const updateStatus = useStore((s) => s.updateArtElementStatus);
  const scenes = useStore((s) => s.scenes);
  const production = useStore((s) => s.production);

  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="pos-table">
          <thead>
            <tr>
              <th>Element</th>
              <th>Category</th>
              <th>Character</th>
              <th>Scenes</th>
              <th className="text-right">Cost</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {artElements.map((el) => {
              const nextIdx = STATUS_ORDER.indexOf(el.status) + 1;
              const nextStatus = STATUS_ORDER[nextIdx];
              return (
                <tr key={el.id}>
                  <td className="font-medium">{el.name}</td>
                  <td><Badge tone="muted">{el.category}</Badge></td>
                  <td className="text-[var(--text-secondary)]">{el.characterName ?? "—"}</td>
                  <td className="text-xs text-[var(--text-muted)]">{el.sceneIds.length} scenes</td>
                  <td className="text-right">
                    {el.cost ? formatCurrency(el.cost, production.currency) : "—"}
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[el.status]}>
                      {el.status.replace("_", " ")}
                    </Badge>
                  </td>
                  <td>
                    {nextStatus && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updateStatus(el.id, nextStatus)}
                      >
                        → {nextStatus.replace("_", " ")}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ContinuityBoard() {
  const continuityPhotos = useStore((s) => s.continuityPhotos);
  const scenes = useStore((s) => s.scenes);

  const grouped = new Map<string, typeof continuityPhotos>();
  for (const p of continuityPhotos) {
    const arr = grouped.get(p.sceneId) ?? [];
    arr.push(p);
    grouped.set(p.sceneId, arr);
  }

  return (
    <div className="space-y-4">
      {Array.from(grouped.entries()).map(([sceneId, photos]) => {
        const scene = scenes.find((s) => s.id === sceneId);
        return (
          <Card key={sceneId}>
            <CardHeader
              title={`Scene ${scene?.number ?? "?"}`}
              subtitle={scene?.location}
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {photos.map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border border-[var(--border-default)] overflow-hidden"
                >
                  <div
                    className="h-28 flex items-center justify-center"
                    style={{ background: "var(--bg-surface-hover)" }}
                  >
                    <Eye size={24} className="text-[var(--text-muted)]" />
                  </div>
                  <div className="p-2">
                    <div className="text-xs text-[var(--text-primary)] line-clamp-2">
                      {p.caption ?? "No caption"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
