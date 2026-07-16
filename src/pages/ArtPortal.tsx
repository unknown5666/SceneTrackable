import React, { useState } from "react";
import { Palette, Eye } from "lucide-react";
import { useStore } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { useRecordEditor } from "@/components/ui/RecordEditor";
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
  const ed = useRecordEditor("artElements");

  if (artElements.length === 0) {
    return (
      <>
        <Card>
          <EmptyState
            icon={<Palette size={48} />}
            title="No art elements yet"
            subtitle="Track wardrobe, props, set dressing and makeup from 'needed' through to 'ready'."
            cta={<ed.AddButton size="md" label="Add First Element" />}
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
          {artElements.length} {artElements.length === 1 ? "element" : "elements"}
        </div>
        <ed.AddButton label="Add Element" />
      </div>
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
                    <div className="flex items-center gap-1">
                      {nextStatus && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => updateStatus(el.id, nextStatus)}
                        >
                          → {nextStatus.replace("_", " ")}
                        </Button>
                      )}
                      <ed.RowActions id={el.id} />
                    </div>
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

function ContinuityBoard() {
  const continuityPhotos = useStore((s) => s.continuityPhotos);
  const scenes = useStore((s) => s.scenes);
  const ed = useRecordEditor("continuityPhotos");

  const grouped = new Map<string, typeof continuityPhotos>();
  for (const p of continuityPhotos) {
    const arr = grouped.get(p.sceneId) ?? [];
    arr.push(p);
    grouped.set(p.sceneId, arr);
  }

  if (continuityPhotos.length === 0) {
    return (
      <>
        <Card>
          <EmptyState
            icon={<Eye size={48} />}
            title="No continuity photos yet"
            subtitle="Log a reference per scene so wardrobe and set dressing can match across shooting days."
            cta={<ed.AddButton size="md" label="Add First Photo" />}
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
          {continuityPhotos.length} {continuityPhotos.length === 1 ? "photo" : "photos"} across{" "}
          {grouped.size} {grouped.size === 1 ? "scene" : "scenes"}
        </div>
        <ed.AddButton label="Add Photo" />
      </div>
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
                  <div className="p-2 flex items-start justify-between gap-1">
                    <div className="text-xs text-[var(--text-primary)] line-clamp-2">
                      {p.caption ?? "No caption"}
                    </div>
                    <ed.RowActions id={p.id} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
      {ed.modal}
    </div>
  );
}
