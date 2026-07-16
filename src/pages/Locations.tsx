import React, { useMemo, useState } from "react";
import { MapPin, Sparkles, Loader2, ChevronRight, AlertCircle } from "lucide-react";
import { useStore, activeProject } from "@/state/store";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { useRecordEditor } from "@/components/ui/RecordEditor";
import {
  ProposalPicker,
  defaultSelection,
  type ProposalItem,
} from "@/components/ui/ProposalPicker";
import { scenesAtLocation } from "@/lib/locations";
import { runLocationPass } from "@/lib/script";
import { locationExists, locationFromProposal } from "@/lib/proposals";
import type { ProposedLocation } from "@/lib/claude";
import { formatDate, cn } from "@/lib/utils";
import type { LocationPermitStatus, ProductionLocation } from "@/types";

const STATUS_TONE: Record<LocationPermitStatus, "muted" | "info" | "warning" | "success" | "neutral"> = {
  scouting: "muted",
  optioned: "info",
  permit_pending: "warning",
  locked: "success",
  wrapped: "neutral",
};

const STATUS_LABEL: Record<LocationPermitStatus, string> = {
  scouting: "Scouting",
  optioned: "Optioned",
  permit_pending: "Permit pending",
  locked: "Locked",
  wrapped: "Wrapped",
};

export function Locations() {
  const locations = useStore((s) => s.locations);
  const scenes = useStore((s) => s.scenes);
  const shootDays = useStore((s) => s.shootDays);
  const project = useStore(activeProject);
  const ed = useRecordEditor("locations");

  const [expanded, setExpanded] = useState<string | null>(null);
  const [rebuildOpen, setRebuildOpen] = useState(false);

  const rows = useMemo(
    () =>
      [...locations]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((loc) => {
          const at = scenesAtLocation(scenes, loc);
          const sceneIds = new Set(at.map((s) => s.id));
          const days = shootDays.filter((d) => d.scenes.some((id) => sceneIds.has(id)));
          return { loc, scenes: at, days };
        }),
    [locations, scenes, shootDays]
  );

  const unrecorded = useMemo(() => {
    // Scene headings the locations collection doesn't cover yet — the gap this
    // page exists to close, so it's worth naming rather than hiding.
    const covered = new Set(rows.flatMap((r) => r.scenes.map((s) => s.id)));
    const names = new Set(
      scenes.filter((s) => !covered.has(s.id) && s.location.trim()).map((s) => s.location.trim())
    );
    return [...names];
  }, [rows, scenes]);

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <div className="section-header">Locations</div>
          <div className="page-title mt-1">Location Bible</div>
        </div>
        <div className="flex items-center gap-2">
          {project?.script && (
            <Button variant="ai" size="sm" onClick={() => setRebuildOpen(true)}>
              <Sparkles size={14} /> Rebuild from script (AI)
            </Button>
          )}
          <ed.AddButton />
        </div>
      </div>

      {locations.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            icon={<MapPin size={48} />}
            title="No locations recorded"
            subtitle={
              project?.script
                ? "Rebuild from the script to consolidate every scene heading into the real places you have to scout — or add one by hand."
                : "Add the places this production shoots. A location can exist before any scene mentions it, and its lock date drives every location_lock task deadline."
            }
            cta={
              project?.script ? (
                <Button variant="ai" onClick={() => setRebuildOpen(true)}>
                  <Sparkles size={14} /> Rebuild from script (AI)
                </Button>
              ) : (
                <ed.AddButton size="md" label="Add First Location" />
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-[var(--text-secondary)]">
            {locations.length} {locations.length === 1 ? "location" : "locations"} ·{" "}
            {rows.filter((r) => r.loc.permitStatus === "locked").length} locked
          </div>

          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="pos-table">
                <thead>
                  <tr>
                    <th className="w-[28px]" />
                    <th>Name</th>
                    <th>Type</th>
                    <th>Permit</th>
                    <th>Lock Date</th>
                    <th className="text-right">Scenes</th>
                    <th className="text-right">Days</th>
                    <th className="w-[90px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ loc, scenes: at, days }) => (
                    <React.Fragment key={loc.id}>
                      <tr
                        className="cursor-pointer"
                        onClick={() => setExpanded(expanded === loc.id ? null : loc.id)}
                      >
                        <td>
                          <ChevronRight
                            size={14}
                            className={cn(
                              "text-[var(--text-muted)] transition-transform",
                              expanded === loc.id && "rotate-90"
                            )}
                          />
                        </td>
                        <td className="font-medium">
                          <div className="flex items-center gap-2">
                            {loc.name}
                            {loc.createdByAI && <Badge tone="ai">AI</Badge>}
                          </div>
                          {loc.aliases?.length ? (
                            <div className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate max-w-[280px]">
                              also {loc.aliases.join(", ")}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <Badge tone="neutral">{loc.type}</Badge>
                        </td>
                        <td>
                          <Badge tone={STATUS_TONE[loc.permitStatus]} dot>
                            {STATUS_LABEL[loc.permitStatus]}
                          </Badge>
                        </td>
                        <td className="text-xs">
                          {loc.lockDate ? (
                            formatDate(loc.lockDate, { year: "numeric" })
                          ) : (
                            <span className="text-[var(--text-muted)]">—</span>
                          )}
                        </td>
                        <td className="text-right">{at.length}</td>
                        <td className="text-right">{days.length}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <ed.RowActions id={loc.id} />
                        </td>
                      </tr>
                      {expanded === loc.id && (
                        <tr>
                          <td colSpan={8} className="bg-[var(--bg-elevated)]">
                            <LocationDetail loc={loc} scenes={at} days={days.map((d) => d.dayNumber)} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {unrecorded.length > 0 && (
            <Card>
              <div className="flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 shrink-0 text-[var(--color-warning)]" />
                <div className="text-xs text-[var(--text-secondary)]">
                  <span className="font-medium text-[var(--text-primary)]">
                    {unrecorded.length} scene heading{unrecorded.length === 1 ? "" : "s"} not covered
                    by any location record
                  </span>{" "}
                  — {unrecorded.slice(0, 6).join(" · ")}
                  {unrecorded.length > 6 && ` · +${unrecorded.length - 6} more`}. Add them, or list
                  them as aliases on the location they belong to.
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {ed.modal}
      <RebuildModal open={rebuildOpen} onClose={() => setRebuildOpen(false)} />
    </div>
  );
}

function LocationDetail({
  loc,
  scenes,
  days,
}: {
  loc: ProductionLocation;
  scenes: { id: string; number: string; intExt: string; timeOfDay: string; synopsis: string }[];
  days: number[];
}) {
  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <DetailBit label="Address" value={loc.address} />
        <DetailBit
          label="Contact"
          value={[loc.contactName, loc.contactPhone].filter(Boolean).join(" · ")}
        />
        <DetailBit label="Shoot days" value={days.length ? days.map((d) => `Day ${d}`).join(", ") : ""} />
        <DetailBit label="Parking" value={loc.parkingNotes} />
        <DetailBit label="Power" value={loc.powerNotes} />
        <DetailBit label="Notes" value={loc.notes} />
      </div>

      {scenes.length > 0 && (
        <div>
          <div className="section-header mb-1.5">Scenes here</div>
          <div className="flex flex-wrap gap-1.5">
            {scenes.map((s) => (
              <span
                key={s.id}
                title={s.synopsis}
                className="text-[11px] px-2 py-1 rounded-badge bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)]"
              >
                <span className="font-mono">{s.number}</span> · {s.intExt} · {s.timeOfDay}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailBit({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="section-header">{label}</div>
      <div className="text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap">
        {value || <span className="text-[var(--text-muted)]">—</span>}
      </div>
    </div>
  );
}

/**
 * Re-runs just the location pass over the active project's script and proposes
 * only locations that aren't recorded yet — one request, and never a silent
 * overwrite of what a location manager already entered.
 */
function RebuildModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const scenes = useStore((s) => s.scenes);
  const locations = useStore((s) => s.locations);
  const project = useStore(activeProject);
  const addRecord = useStore((s) => s.addRecord);
  const recordAIUsage = useStore((s) => s.recordAIUsage);

  const [busy, setBusy] = useState(false);
  const [proposals, setProposals] = useState<ProposedLocation[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fromMock, setFromMock] = useState(false);
  const [error, setError] = useState("");

  const items: ProposalItem[] = useMemo(
    () =>
      (proposals ?? []).map((p) => {
        const dupe = locationExists(p, locations);
        return {
          key: p.name,
          label: p.name,
          detail: [
            p.aliases?.length ? `also ${p.aliases.join(", ")}` : "",
            p.suggestedNotes ?? "",
          ]
            .filter(Boolean)
            .join(" — "),
          badge: (
            <div className="flex items-center gap-1.5">
              <Badge tone="neutral">{p.type}</Badge>
              {p.sceneNumbers?.length ? (
                <Badge tone="muted">{p.sceneNumbers.length} sc.</Badge>
              ) : null}
            </div>
          ),
          existing: Boolean(dupe),
          existingLabel: "Recorded",
        };
      }),
    [proposals, locations]
  );

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await runLocationPass(scenes, project?.name);
      if (res.usage) recordAIUsage(res.usage);
      setProposals(res.locations);
      setFromMock(res.fromMock);
      const next = defaultSelection(
        res.locations.map((p) => ({
          key: p.name,
          label: p.name,
          existing: Boolean(locationExists(p, locations)),
        }))
      );
      setSelected(next);
    } catch (e) {
      setError((e as Error).message || "The location pass failed.");
    } finally {
      setBusy(false);
    }
  };

  const accept = () => {
    for (const p of proposals ?? []) {
      if (!selected.has(p.name)) continue;
      if (locationExists(p, locations)) continue;
      addRecord("locations", locationFromProposal(p));
    }
    close();
  };

  const close = () => {
    setProposals(null);
    setSelected(new Set());
    setError("");
    setFromMock(false);
    onClose();
  };

  const newCount = items.filter((i) => !i.existing).length;

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : close}
      size="lg"
      title="Rebuild locations from the script"
      subtitle="One AI pass over the whole screenplay, consolidating scene headings into the places you actually scout. Only locations you don't already have are proposed."
      footer={
        proposals ? (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={accept} disabled={selected.size === 0}>
              Add {selected.size} location{selected.size === 1 ? "" : "s"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="ai" onClick={run} disabled={busy || scenes.length === 0}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {busy ? "Reading the script…" : "Run location pass"}
            </Button>
          </>
        )
      }
    >
      {error ? (
        <EmptyState icon={<MapPin size={40} />} title="Couldn't rebuild locations" subtitle={error} />
      ) : proposals ? (
        <div className="space-y-3">
          {fromMock && (
            <Badge tone="ai">
              Demo mode — headings were grouped by name. Add an API key in AI Settings for a real
              consolidation.
            </Badge>
          )}
          <ProposalPicker
            items={items}
            selected={selected}
            onChange={setSelected}
            groupLabel={`${newCount} new · ${items.length - newCount} already recorded`}
            emptyMessage="No locations found in this script."
          />
        </div>
      ) : busy ? (
        <div className="flex flex-col items-center py-12 gap-3">
          <Sparkles size={28} className="text-[var(--color-ai)] animate-pulse" />
          <div className="text-sm text-[var(--text-secondary)]">
            Consolidating {scenes.length} scene headings…
          </div>
        </div>
      ) : (
        <div className="text-sm text-[var(--text-secondary)] py-4">
          {scenes.length === 0
            ? "This project has no scenes yet — upload a script first."
            : `Reads all ${scenes.length} scenes in one request and proposes the consolidated locations.`}
        </div>
      )}
    </Modal>
  );
}
