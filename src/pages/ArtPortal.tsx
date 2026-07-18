import React, { useMemo, useState } from "react";
import { Palette, Eye, Sparkles, Loader2, Check, AlertTriangle } from "lucide-react";
import { useStore, activeProject, canWrite } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { useRecordEditor } from "@/components/ui/RecordEditor";
import { ImageThumb } from "@/components/ui/Media";
import { ProposalPicker, type ProposalItem } from "@/components/ui/ProposalPicker";
import { aiArtSuggestions, isAllowanceExhausted } from "@/lib/claude";
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
  const cast = useStore((s) => s.cast);
  const production = useStore((s) => s.production);
  const writable = useStore((s) => canWrite(s, "art"));
  const ed = useRecordEditor("artElements");
  const [suggestOpen, setSuggestOpen] = useState(false);

  const suggestBtn =
    writable && cast.some((c) => c.scenes.length > 0) ? (
      <Button variant="ai" size="sm" onClick={() => setSuggestOpen(true)}>
        <Sparkles size={14} /> Suggest props & wardrobe
      </Button>
    ) : null;

  if (artElements.length === 0) {
    return (
      <>
        <Card>
          <EmptyState
            icon={<Palette size={48} />}
            title="No art elements yet"
            subtitle="Track wardrobe, props, set dressing and makeup from 'needed' through to 'ready'. Or let the AI suggest them from each character's scenes."
            cta={
              <div className="flex items-center gap-2">
                {suggestBtn}
                <ed.AddButton size="md" label="Add First Element" />
              </div>
            }
          />
        </Card>
        {ed.modal}
        <ArtSuggestModal open={suggestOpen} onClose={() => setSuggestOpen(false)} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--text-secondary)]">
          {artElements.length} {artElements.length === 1 ? "element" : "elements"}
        </div>
        <div className="flex items-center gap-2">
          {suggestBtn}
          <ed.AddButton label="Add Element" />
        </div>
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
                  <td className="font-medium">
                    <div className="flex items-center gap-2">
                      <ImageThumb src={el.imageUrl} alt={el.name} size={30} />
                      <span className="flex items-center gap-1.5">
                        {el.name}
                        {el.createdByAI && <Badge tone="ai">AI</Badge>}
                      </span>
                    </div>
                  </td>
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
      <ArtSuggestModal open={suggestOpen} onClose={() => setSuggestOpen(false)} />
    </div>
  );
}

// ============================================================
// AI PROP / WARDROBE SUGGESTIONS (E4)
//
// One small call per character, driven through the background job runner so
// the run shows in the TopBar pill and survives navigation. Gathered
// suggestions are reviewed and only written on accept. If the GLM allowance
// runs out mid-run it pauses with progress kept — resume the remaining
// characters.
// ============================================================

interface ArtProposal {
  key: string;
  characterId: string;
  character: string;
  sceneIds: string[];
  name: string;
  category: "wardrobe" | "prop" | "set_dressing" | "makeup";
  notes?: string;
}

function ArtSuggestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cast = useStore((s) => s.cast);
  const scenes = useStore((s) => s.scenes);
  const artElements = useStore((s) => s.artElements);
  const project = useStore(activeProject);
  const addRecord = useStore((s) => s.addRecord);
  const recordAIUsage = useStore((s) => s.recordAIUsage);
  const jobBegin = useStore((s) => s.aiJobBegin);
  const jobProgress = useStore((s) => s.aiJobProgress);
  const jobPause = useStore((s) => s.aiJobPauseLimit);
  const jobDone = useStore((s) => s.aiJobDone);
  const jobFail = useStore((s) => s.aiJobFail);
  const jobReset = useStore((s) => s.aiJobReset);

  const candidates = useMemo(() => cast.filter((c) => c.scenes.length > 0), [cast]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(candidates.map((c) => c.id)));
  const [doneChars, setDoneChars] = useState<Set<string>>(new Set());
  const [proposals, setProposals] = useState<ArtProposal[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");

  const remaining = candidates.filter((c) => selected.has(c.id) && !doneChars.has(c.id));
  const started = doneChars.size > 0 || proposals.length > 0;

  const run = async () => {
    const targets = remaining;
    if (targets.length === 0) return;
    setBusy(true);
    setError("");
    setPaused(false);
    jobBegin("art_suggestions", {
      label: "Prop / wardrobe ideas",
      total: selected.size,
      route: "/art",
    });
    let done = doneChars.size;
    jobProgress("art_suggestions", done, selected.size);
    try {
      for (const c of targets) {
        const theirScenes = scenes.filter((s) => c.scenes.includes(s.id));
        const digest = theirScenes
          .map((s) => `Sc.${s.number} ${s.intExt}. ${s.location} — ${s.timeOfDay}: ${s.synopsis}`)
          .join("\n")
          .slice(0, 4000);
        const label = c.role || c.name;
        const existing = artElements
          .filter((a) => a.characterName === c.role || a.characterName === c.name)
          .map((a) => a.name);
        try {
          const { elements, result } = await aiArtSuggestions(label, digest, existing, project?.name);
          recordAIUsage({
            feature: "art_suggestions",
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            model: result.model,
            costUsd: result.costUsd,
          });
          const mapped: ArtProposal[] = elements.map((e, i) => ({
            key: `${c.id}:${i}:${e.name}`,
            characterId: c.id,
            character: label,
            sceneIds: c.scenes,
            name: e.name,
            category: e.category,
            notes: e.notes,
          }));
          setProposals((prev) => [...prev, ...mapped]);
          setPicked((prev) => {
            const n = new Set(prev);
            mapped.forEach((m) => n.add(m.key));
            return n;
          });
          setDoneChars((prev) => new Set(prev).add(c.id));
          done += 1;
          jobProgress("art_suggestions", done, selected.size);
        } catch (err) {
          if (isAllowanceExhausted(err)) {
            jobPause("art_suggestions", (err as Error).message);
            setPaused(true);
            setBusy(false);
            return;
          }
          throw err;
        }
      }
      jobDone("art_suggestions");
    } catch (err) {
      setError((err as Error).message || "The suggestions run failed.");
      jobFail("art_suggestions", (err as Error).message || "failed");
    } finally {
      setBusy(false);
    }
  };

  const accept = () => {
    for (const p of proposals) {
      if (!picked.has(p.key)) continue;
      addRecord("artElements", {
        name: p.name,
        category: p.category,
        status: "needed",
        characterName: p.character,
        sceneIds: p.sceneIds,
        notes: p.notes,
        createdByAI: true,
      });
    }
    close();
  };

  const close = () => {
    jobReset("art_suggestions");
    setDoneChars(new Set());
    setProposals([]);
    setPicked(new Set());
    setBusy(false);
    setPaused(false);
    setError("");
    setSelected(new Set(candidates.map((c) => c.id)));
    onClose();
  };

  const items: ProposalItem[] = proposals.map((p) => ({
    key: p.key,
    label: p.name,
    detail: `${p.character}${p.notes ? ` — ${p.notes}` : ""}`,
    badge: <Badge tone="muted">{p.category.replace("_", " ")}</Badge>,
  }));

  const runLabel =
    started && remaining.length > 0
      ? `Resume — ${doneChars.size} of ${selected.size} done`
      : proposals.length > 0
      ? "Re-run"
      : "Suggest for selected";

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : close}
      size="lg"
      title="Suggest props & wardrobe"
      subtitle="One small AI pass per character over their scenes. Review before anything is added."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            {proposals.length ? "Cancel" : "Close"}
          </Button>
          {proposals.length > 0 && (
            <Button onClick={accept} disabled={busy || picked.size === 0}>
              <Check size={14} /> Add {picked.size} element{picked.size === 1 ? "" : "s"}
            </Button>
          )}
          <Button variant="ai" onClick={run} disabled={busy || remaining.length === 0}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {busy ? "Reading scenes…" : runLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {paused && (
          <div
            className="flex items-start gap-2 rounded-lg border p-3 text-xs"
            style={{ borderColor: "var(--color-warning)", background: "rgba(245,158,11,0.08)" }}
          >
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[var(--color-warning)]" />
            <span className="text-[var(--text-secondary)]">
              GLM free allowance exhausted — progress saved ({doneChars.size}/{selected.size}{" "}
              characters). Resume when the allowance resets; suggestions gathered so far are kept.
            </span>
          </div>
        )}
        {error && (
          <div className="text-xs text-[var(--color-danger)]">{error}</div>
        )}

        {/* Character selection */}
        <div>
          <div className="section-header mb-1.5">Characters ({selected.size} selected)</div>
          <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
            {candidates.map((c) => {
              const on = selected.has(c.id);
              return (
                <button
                  key={c.id}
                  disabled={busy}
                  onClick={() =>
                    setSelected((prev) => {
                      const n = new Set(prev);
                      if (n.has(c.id)) n.delete(c.id);
                      else n.add(c.id);
                      return n;
                    })
                  }
                  className={cn(
                    "px-2 py-1 rounded-badge text-[11px] border transition-colors",
                    on
                      ? "border-[var(--accent-blue)] bg-[var(--active-tint)] text-[var(--accent-blue)]"
                      : "border-[var(--border-default)] text-[var(--text-secondary)]"
                  )}
                >
                  {c.role || c.name}
                  {doneChars.has(c.id) && " ✓"}
                </button>
              );
            })}
          </div>
        </div>

        {proposals.length > 0 && (
          <ProposalPicker
            items={items}
            selected={picked}
            onChange={setPicked}
            groupLabel={`${proposals.length} suggestion${proposals.length === 1 ? "" : "s"}`}
          />
        )}
      </div>
    </Modal>
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
