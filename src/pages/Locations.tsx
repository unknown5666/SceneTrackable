import React, { useMemo, useState } from "react";
import { MapPin, Sparkles, Loader2, ChevronRight, AlertCircle } from "lucide-react";
import { useStore, activeProject } from "@/state/store";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { IntExtBadge, TimeBadge } from "@/components/ui/SceneHeading";
import { useRecordEditor } from "@/components/ui/RecordEditor";
import { ImageThumb, MapEmbed, MapLink } from "@/components/ui/Media";
import {
  ProposalPicker,
  defaultSelection,
  type ProposalItem,
} from "@/components/ui/ProposalPicker";
import { scenesAtLocation } from "@/lib/locations";
import { runLocationPass } from "@/lib/script";
import { locationExists, locationFromProposal } from "@/lib/proposals";
import { aiLocationScout, isAllowanceExhausted, type ProposedLocation } from "@/lib/claude";
import { Sparkles as SparklesIcon, Loader2 as Loader2Icon, Check as CheckIcon } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import type { LocationPermitStatus, ProductionLocation, Scene } from "@/types";

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
  const [scout, setScout] = useState<{ loc: ProductionLocation; scenes: Scene[] } | null>(null);

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
      <div className="flex items-start justify-between gap-3 mb-6" data-tour="page-header">
        <div>
          <div className="section-header">Locations</div>
          <div className="page-title mt-1">Location Bible</div>
        </div>
        <div className="flex items-center gap-2">
          {project?.script && ed.canWrite && (
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
              project?.script && ed.canWrite ? (
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
                            <ImageThumb src={loc.imageUrl} alt={loc.name} size={30} enlarge={false} />
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
                            <LocationDetail
                              loc={loc}
                              scenes={at}
                              days={days.map((d) => d.dayNumber)}
                              onScout={
                                ed.canWrite && at.length > 0
                                  ? () => setScout({ loc, scenes: at })
                                  : undefined
                              }
                            />
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
      <ScoutBriefModal data={scout} onClose={() => setScout(null)} />
    </div>
  );
}

function LocationDetail({
  loc,
  scenes,
  days,
  onScout,
}: {
  loc: ProductionLocation;
  scenes: { id: string; number: string; intExt: string; timeOfDay: string; synopsis: string }[];
  days: number[];
  onScout?: () => void;
}) {
  return (
    <div className="p-4 space-y-3">
      {onScout && (
        <div className="flex justify-end">
          <Button variant="ai" size="sm" onClick={onScout}>
            <SparklesIcon size={14} /> Scout brief (AI)
          </Button>
        </div>
      )}
      {(loc.imageUrl || loc.mapUrl || loc.address) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {loc.imageUrl && (
            <ImageThumb src={loc.imageUrl} alt={loc.name} size={160} rounded="rounded-lg" className="w-full" />
          )}
          <MapEmbed value={loc.mapUrl} address={loc.address} height={160} />
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <DetailBit
          label="Address"
          value={loc.address}
          extra={<MapLink value={loc.mapUrl} address={loc.address} />}
        />
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
                className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-badge bg-[var(--bg-surface)] border border-[var(--border-default)]"
              >
                <span className="font-mono text-[var(--text-secondary)]">{s.number}</span>
                <IntExtBadge intExt={s.intExt as Scene["intExt"]} />
                <TimeBadge time={s.timeOfDay as Scene["timeOfDay"]} />
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// AI LOCATION SCOUT BRIEF (E4)
//
// One small call over a single location's scenes → a review-and-apply brief
// that fills the location's own notes fields. Never a silent overwrite: the
// producer edits the proposed text before it's saved.
// ============================================================
function ScoutBriefModal({
  data,
  onClose,
}: {
  data: { loc: ProductionLocation; scenes: Scene[] } | null;
  onClose: () => void;
}) {
  const project = useStore(activeProject);
  const updateRecord = useStore((s) => s.updateRecord);
  const recordAIUsage = useStore((s) => s.recordAIUsage);

  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [parking, setParking] = useState("");
  const [power, setPower] = useState("");
  const [ran, setRan] = useState("");

  const loc = data?.loc;

  // Seed the form when a location's modal opens; clear the marker on close so
  // reopening the same location re-seeds from the current record.
  if (data && ran !== loc!.id) {
    setRan(loc!.id);
    setNotes(loc!.notes ?? "");
    setParking(loc!.parkingNotes ?? "");
    setPower(loc!.powerNotes ?? "");
    setError("");
    setLimit(false);
  } else if (!data && ran !== "") {
    setRan("");
  }

  const run = async () => {
    if (!data) return;
    setBusy(true);
    setError("");
    setLimit(false);
    try {
      const digest = data.scenes
        .map((s) => `Sc.${s.number} ${s.intExt}. ${s.location} — ${s.timeOfDay}: ${s.synopsis}`)
        .join("\n")
        .slice(0, 4000);
      const { brief, result } = await aiLocationScout(data.loc.name, digest, project?.name);
      recordAIUsage({
        feature: "location_scout",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        model: result.model,
        costUsd: result.costUsd,
      });
      if (brief) {
        const permit = brief.permitNotes ? `\nPermits/access: ${brief.permitNotes}` : "";
        setNotes([data.loc.notes, `${brief.summary}${permit}`].filter(Boolean).join("\n\n"));
        if (brief.parkingNotes) setParking(brief.parkingNotes);
        if (brief.powerNotes) setPower(brief.powerNotes);
      }
    } catch (err) {
      if (isAllowanceExhausted(err)) setLimit(true);
      else setError((err as Error).message || "The scout brief failed.");
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!loc) return;
    updateRecord("locations", loc.id, {
      ...loc,
      notes: notes.trim() || undefined,
      parkingNotes: parking.trim() || undefined,
      powerNotes: power.trim() || undefined,
    });
    onClose();
  };

  return (
    <Modal
      open={!!data}
      onClose={busy ? () => undefined : onClose}
      size="lg"
      title={`Scout brief — ${loc?.name ?? ""}`}
      subtitle="One AI pass over this location's scenes. Edit the draft, then apply it to the notes."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={busy}>
            <CheckIcon size={14} /> Apply to notes
          </Button>
          <Button variant="ai" onClick={run} disabled={busy}>
            {busy ? <Loader2Icon size={14} className="animate-spin" /> : <SparklesIcon size={14} />}
            {busy ? "Reading scenes…" : "Draft brief"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {limit && (
          <div className="text-xs text-[var(--color-warning)]">
            GLM free allowance exhausted — try again once it resets. Your notes are unchanged.
          </div>
        )}
        {error && <div className="text-xs text-[var(--color-danger)]">{error}</div>}
        <div>
          <label className="section-header block mb-1.5">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full min-h-[110px]"
            placeholder="Run the brief, or write your own."
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="section-header block mb-1.5">Parking</label>
            <textarea value={parking} onChange={(e) => setParking(e.target.value)} className="w-full min-h-[70px]" />
          </div>
          <div>
            <label className="section-header block mb-1.5">Power</label>
            <textarea value={power} onChange={(e) => setPower(e.target.value)} className="w-full min-h-[70px]" />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function DetailBit({
  label,
  value,
  extra,
}: {
  label: string;
  value?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div>
      <div className="section-header flex items-center gap-2">
        {label}
        {extra}
      </div>
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
