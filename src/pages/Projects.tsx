import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  FolderKanban,
  Plus,
  Upload,
  FileText,
  Sparkles,
  Trash2,
  ArrowRight,
  Loader2,
  Film,
  Pencil,
  X,
  Minimize2,
  RefreshCw,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useStore, type BreakdownRunState } from "@/state/store";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { ProjectPoster } from "@/components/ui/ProjectPoster";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadSampleButton } from "@/components/ui/LoadSampleButton";
import { LoadBundledButton } from "@/components/ui/LoadBundledButton";
import { formatDate } from "@/lib/utils";
import { parseScreenplay } from "@/lib/script";
import {
  BreakdownTheater,
  TheaterSummary,
} from "@/components/breakdown/BreakdownTheater";
import { extractPdfText } from "@/lib/pdf";
import type { ProposedLocation, ScriptCharacter } from "@/lib/claude";
import {
  ProposalPicker,
  defaultSelection,
  type ProposalItem,
} from "@/components/ui/ProposalPicker";
import {
  castFromCharacter,
  characterExists,
  locationExists,
  locationFromProposal,
} from "@/lib/proposals";
import type { Scene } from "@/types";

const CURRENCIES = ["AED", "USD", "EUR", "GBP", "INR", "CAD"];

// Only the pre-run stages are local now; the run itself (running/done/error)
// lives in the store as `breakdownRun`, so it survives closing this dialog.
type UploadStage = "input" | "parsing" | "parsed" | "error";

export function Projects() {
  const nav = useNavigate();
  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const createProject = useStore((s) => s.createProject);
  const switchProject = useStore((s) => s.switchProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const renameProject = useStore((s) => s.renameProject);
  const addCastMember = useStore((s) => s.addCastMember);
  const addRecord = useStore((s) => s.addRecord);
  const cast = useStore((s) => s.cast);
  const storeLocations = useStore((s) => s.locations);

  // The background breakdown run + its controls.
  const breakdownRun = useStore((s) => s.breakdownRun);
  const startBreakdownRun = useStore((s) => s.startBreakdownRun);
  const clearBreakdownRun = useStore((s) => s.clearBreakdownRun);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCurrency, setNewCurrency] = useState("AED");

  // Rename
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  // Upload modal
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [stage, setStage] = useState<UploadStage>("input");
  const [pasteText, setPasteText] = useState("");
  const [fileName, setFileName] = useState<string>("");
  const [source, setSource] = useState<"pdf" | "paste">("paste");
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<Scene[]>([]);
  const [pageCount, setPageCount] = useState<number | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState("");
  // Reopening the run view (theater/proposals) without a fresh upload — from
  // the resume bar or the TopBar pill's `?review=1` deep link.
  const [reviewOpen, setReviewOpen] = useState(false);
  // Proposal selections, seeded when a run completes.
  const [castSel, setCastSel] = useState<Set<string>>(new Set());
  const [locSel, setLocSel] = useState<Set<string>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);

  const [params, setParams] = useSearchParams();

  // Deep link from the pill / completion toast opens the run view.
  useEffect(() => {
    if (params.get("review") && breakdownRun) {
      setReviewOpen(true);
      const next = new URLSearchParams(params);
      next.delete("review");
      setParams(next, { replace: true });
    }
  }, [params, breakdownRun, setParams]);

  // Seed the accept-these-records selections once a run finishes. Keyed on the
  // run's start time so a retry (which doesn't change the cast/locations) never
  // stomps a selection the user is mid-edit on.
  const doneStamp = breakdownRun?.status === "done" ? breakdownRun.startedAt : 0;
  useEffect(() => {
    if (!breakdownRun || breakdownRun.status !== "done") return;
    setCastSel(
      defaultSelection(
        breakdownRun.characters
          .filter((c) => c.speaking)
          .map((c) => ({ key: c.name, label: c.name, existing: Boolean(characterExists(c, cast)) }))
      )
    );
    setLocSel(
      defaultSelection(
        breakdownRun.locations.map((l) => ({
          key: l.name,
          label: l.name,
          existing: Boolean(locationExists(l, storeLocations)),
        }))
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneStamp]);

  // Whether the modal should render the run view (theater/proposals) rather
  // than the pre-run upload flow.
  const runView = Boolean(breakdownRun) && (uploadFor === breakdownRun?.projectId || reviewOpen);

  /**
   * Commits the accepted proposals. The breakdown itself is already saved —
   * this stops the cast bible and the location list from being thrown away
   * when the dialog closes.
   */
  const acceptProposals = () => {
    if (!breakdownRun) return;
    const scenes = useStore.getState().scenes;
    for (const c of breakdownRun.characters) {
      if (!castSel.has(c.name)) continue;
      if (characterExists(c, useStore.getState().cast)) continue;
      addCastMember(castFromCharacter(c, scenes));
    }
    for (const l of breakdownRun.locations) {
      if (!locSel.has(l.name)) continue;
      if (locationExists(l, useStore.getState().locations)) continue;
      addRecord("locations", locationFromProposal(l));
    }
  };

  const acceptedCount = castSel.size + locSel.size;

  const openCreate = () => {
    setNewName("");
    setNewCurrency("AED");
    setCreateOpen(true);
  };

  const doCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createProject(name, newCurrency);
    setCreateOpen(false);
  };

  const openProject = (id: string) => {
    switchProject(id);
    nav("/dashboard");
  };

  const openUpload = (id: string) => {
    switchProject(id);
    setUploadFor(id);
    setReviewOpen(false);
    setStage("input");
    setPasteText("");
    setFileName("");
    setRawText("");
    setSource("paste");
    setParsed([]);
    setPageCount(undefined);
    setErrorMsg("");
  };

  // The run persists in the store, so closing is always safe — it just drops
  // to the background (TopBar pill + completion toast keep the user informed).
  const closeUpload = () => {
    setUploadFor(null);
    setReviewOpen(false);
  };

  const onFile = async (file: File) => {
    setStage("parsing");
    setSource("pdf");
    setFileName(file.name);
    try {
      const { text, pageCount } = await extractPdfText(file);
      setRawText(text);
      setPageCount(pageCount);
      const scenes = parseScreenplay(text);
      setParsed(scenes);
      setStage(scenes.length ? "parsed" : "error");
      if (!scenes.length) setErrorMsg("No scene headings (INT./EXT.) were detected in this PDF.");
    } catch (e) {
      setErrorMsg((e as Error).message || "Could not read the PDF.");
      setStage("error");
    }
  };

  const parsePaste = () => {
    const text = pasteText;
    setSource("paste");
    setRawText(text);
    const scenes = parseScreenplay(text);
    setParsed(scenes);
    if (scenes.length) {
      setStage("parsed");
    } else {
      setErrorMsg(
        "No scene headings detected. Screenplay scenes should start with INT. or EXT. — e.g. “INT. KITCHEN - NIGHT”."
      );
      setStage("error");
    }
  };

  // Kick off the run in the store and let it stream into the theater. The
  // dialog can be closed at any time; the run keeps going.
  const run = () => {
    if (!uploadFor) return;
    const projectName = projects.find((p) => p.id === uploadFor)?.name;
    void startBreakdownRun({
      projectId: uploadFor,
      projectName,
      scenes: parsed,
      source,
      fileName: source === "pdf" ? fileName : undefined,
      rawText,
      pageCount,
    });
  };

  const finishReview = (accept: boolean) => {
    if (accept) acceptProposals();
    clearBreakdownRun();
    closeUpload();
    nav("/breakdown");
  };

  const modalOpen = !!uploadFor || reviewOpen;
  const runStatus = runView ? breakdownRun!.status : null;

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="section-header">Productions</div>
          <div className="page-title mt-1">Projects</div>
        </div>
        <div className="flex items-center gap-2">
          {/* Merges rather than replaces, so it's safe to offer even once the
              workspace has projects in it. */}
          {projects.length > 0 && !projects.some((p) => p.id === "proj_yadoo3") && (
            <LoadBundledButton id="yadoo3" size="md" />
          )}
          <Button onClick={openCreate}>
            <Plus size={14} /> New project
          </Button>
        </div>
      </div>

      {/* Resume bar for a run happening in the background */}
      {breakdownRun && !modalOpen && (
        <ResumeBar
          run={breakdownRun}
          onOpen={() => setReviewOpen(true)}
          onDismiss={breakdownRun.status !== "running" ? () => clearBreakdownRun() : undefined}
        />
      )}

      {projects.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            icon={<FolderKanban size={48} />}
            title="Create your first production"
            subtitle="A project holds one script and its full breakdown. Create one, then upload a screenplay to generate scenes, cast, locations, props and more — automatically. Or open a fully dressed production to explore every feature."
            cta={
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <Button onClick={openCreate}>
                  <Plus size={14} /> New project
                </Button>
                <LoadSampleButton />
                <LoadBundledButton id="yadoo3" />
              </div>
            }
          />
        </Card>
      ) : (
        <motion.div
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {projects.map((p) => (
            <motion.div key={p.id} variants={staggerItem}>
            <Card glow className="relative flex flex-col h-full">
              <div
                className="absolute inset-x-0 top-0 h-0.5 rounded-t-card"
                style={{
                  background:
                    p.id === activeProjectId
                      ? "linear-gradient(90deg,#4F7BF7,#8B5CF6)"
                      : "transparent",
                }}
              />
              <div className="flex items-start justify-between gap-2">
                <ProjectPoster id={p.id} name={p.name} size={40} glyph className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  {renaming === p.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        value={renameVal}
                        onChange={(e) => setRenameVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            renameProject(p.id, renameVal.trim() || p.name);
                            setRenaming(null);
                          }
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        className="h-7 text-sm w-full px-2 py-0 leading-none"
                        autoFocus
                      />
                      <button onClick={() => setRenaming(null)} className="text-[var(--text-muted)]">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <div className="text-base font-semibold text-[var(--text-primary)] truncate">
                        {p.name}
                      </div>
                      <button
                        onClick={() => {
                          setRenaming(p.id);
                          setRenameVal(p.name);
                        }}
                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  )}
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {p.currency} · created {formatDate(p.createdAt)}
                  </div>
                </div>
                {p.id === activeProjectId && <Badge tone="neutral">Active</Badge>}
              </div>

              <div className="flex items-center gap-4 mt-4 mb-4">
                <div>
                  <div className="data-value text-lg">{p.sceneCount}</div>
                  <div className="section-header">Scenes</div>
                </div>
                <div>
                  <div className="data-value text-lg">{p.elementCount}</div>
                  <div className="section-header">Elements</div>
                </div>
                <div className="ml-auto">
                  {p.script ? (
                    <Badge tone="success" dot>Script loaded</Badge>
                  ) : (
                    <Badge tone="muted">No script</Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 mt-auto">
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => openUpload(p.id)}>
                  <Upload size={12} /> {p.script ? "Re-upload" : "Upload script"}
                </Button>
                <Button size="sm" className="flex-1" onClick={() => openProject(p.id)}>
                  Open <ArrowRight size={12} />
                </Button>
                <button
                  onClick={() => {
                    if (confirm(`Delete project “${p.name}”? This removes its breakdown.`)) deleteProject(p.id);
                  }}
                  className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--bg-surface-hover)]"
                  aria-label="Delete project"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New project"
        subtitle="Name your production. You'll upload the script next."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doCreate} disabled={!newName.trim()}>
              Create project
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="section-header block mb-1.5">Project name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doCreate()}
              placeholder="e.g. Midnight in Marrakesh"
              className="w-full"
              autoFocus
            />
          </div>
          <div>
            <label className="section-header block mb-1.5">Budget currency</label>
            <select value={newCurrency} onChange={(e) => setNewCurrency(e.target.value)} className="w-full">
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* Upload / breakdown modal */}
      <Modal
        open={modalOpen}
        onClose={closeUpload}
        title="Upload script → AI breakdown"
        subtitle="Upload a PDF screenplay or paste the text. SceneTrackable extracts every scene and element."
        size="lg"
        footer={
          runStatus === "running" ? (
            <Button variant="secondary" onClick={closeUpload}>
              <Minimize2 size={14} /> Continue in background
            </Button>
          ) : runStatus === "done" ? (
            <>
              <Button variant="secondary" onClick={() => finishReview(false)}>
                Skip
              </Button>
              <Button onClick={() => finishReview(true)}>
                {acceptedCount > 0
                  ? `Create ${acceptedCount} record${acceptedCount === 1 ? "" : "s"} & continue`
                  : "Continue"}{" "}
                <ArrowRight size={14} />
              </Button>
            </>
          ) : runStatus === "error" ? (
            <Button variant="secondary" onClick={() => { clearBreakdownRun(); closeUpload(); }}>
              Close
            </Button>
          ) : stage === "input" ? (
            <>
              <Button variant="secondary" onClick={closeUpload}>
                Cancel
              </Button>
              <Button onClick={parsePaste} disabled={!pasteText.trim()}>
                <FileText size={14} /> Parse pasted text
              </Button>
            </>
          ) : stage === "parsed" ? (
            <>
              <Button variant="secondary" onClick={() => setStage("input")}>
                Back
              </Button>
              <Button variant="ai" onClick={run}>
                <Sparkles size={14} /> Run breakdown ({parsed.length} scenes)
              </Button>
            </>
          ) : stage === "error" ? (
            <Button variant="secondary" onClick={() => setStage("input")}>
              Try again
            </Button>
          ) : null
        }
      >
        {runView ? (
          runStatus === "running" ? (
            <BreakdownTheater
              scenes={breakdownRun!.scenes}
              results={breakdownRun!.results}
              progress={breakdownRun!.progress}
            />
          ) : runStatus === "done" ? (
            <div className="space-y-5">
              <TheaterSummary
                sceneCount={breakdownRun!.scenes.length}
                elementCount={Object.values(breakdownRun!.results).reduce(
                  (n, r) => n + r.elements.length,
                  0
                )}
                characterCount={breakdownRun!.characters.length}
                locationCount={breakdownRun!.locations.length}
                seconds={breakdownRun!.runSeconds}
              />
              <RetryPanel run={breakdownRun!} />
              <BreakdownResults
                characters={breakdownRun!.characters}
                locations={breakdownRun!.locations}
                usedDemo={breakdownRun!.usedDemo}
                castSelection={castSel}
                onCastSelection={setCastSel}
                locationSelection={locSel}
                onLocationSelection={setLocSel}
              />
            </div>
          ) : (
            <EmptyState
              icon={<Film size={40} />}
              title="Breakdown failed"
              subtitle={breakdownRun!.error || "Something went wrong."}
            />
          )
        ) : (
          <>
            {stage === "input" && (
              <div className="space-y-5">
                {/* PDF drop */}
                <div
                  onClick={() => fileInput.current?.click()}
                  className="border-2 border-dashed border-[var(--border-default)] hover:border-[var(--accent-blue)] rounded-card p-8 text-center cursor-pointer transition-colors"
                >
                  <Upload size={28} className="mx-auto text-[var(--text-muted)]" />
                  <div className="mt-2 text-sm font-medium text-[var(--text-primary)]">Upload a PDF screenplay</div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">Parsed privately in your browser</div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                  />
                </div>

                <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                  <div className="flex-1 h-px bg-[var(--border-default)]" /> OR PASTE
                  <div className="flex-1 h-px bg-[var(--border-default)]" />
                </div>

                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={"Paste your screenplay here…\n\nINT. COFFEE SHOP - DAY\n\nMAYA sits by the window, nursing a cold espresso…"}
                  className="w-full h-48 font-mono text-xs resize-none"
                />
              </div>
            )}

            {stage === "parsing" && (
              <div className="flex flex-col items-center py-12 gap-3">
                <Loader2 size={32} className="animate-spin text-[var(--color-ai)]" />
                <div className="text-sm text-[var(--text-secondary)]">Reading “{fileName}”…</div>
              </div>
            )}

            {stage === "parsed" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge tone="success" dot>
                    {parsed.length} scenes detected
                  </Badge>
                  {pageCount && <Badge tone="muted">{pageCount} pages</Badge>}
                  {source === "pdf" && <Badge tone="muted">{fileName}</Badge>}
                </div>
                <div className="text-sm text-[var(--text-secondary)]">
                  Ready to break down. This analyzes each scene for cast, extras, props, wardrobe, SFX, VFX,
                  vehicles, animals, locations and production requirements. You can keep working while it runs.
                </div>
                <div className="max-h-56 overflow-y-auto rounded-card border border-[var(--border-default)] divide-y divide-[var(--border-default)]">
                  {parsed.slice(0, 40).map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-2.5 text-sm">
                      <span className="font-mono text-xs text-[var(--text-muted)] w-8 shrink-0">{s.number}</span>
                      <Badge tone="neutral">{s.intExt}</Badge>
                      <span className="truncate flex-1 text-[var(--text-primary)]">{s.location}</span>
                      <span className="text-[10px] text-[var(--text-muted)] shrink-0">{s.timeOfDay}</span>
                    </div>
                  ))}
                  {parsed.length > 40 && (
                    <div className="p-2 text-center text-xs text-[var(--text-muted)]">
                      + {parsed.length - 40} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {stage === "error" && (
              <EmptyState icon={<Film size={40} />} title="Couldn't parse the script" subtitle={errorMsg} />
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

/**
 * A slim bar shown on the Projects page while a breakdown is running (or done
 * and awaiting review) with the dialog closed — the way back into the theater.
 */
function ResumeBar({
  run,
  onOpen,
  onDismiss,
}: {
  run: BreakdownRunState;
  onOpen: () => void;
  onDismiss?: () => void;
}) {
  const done = run.progress?.done ?? 0;
  const total = run.progress?.total ?? run.scenes.length;
  const failed = run.failedScenes.length;
  const running = run.status === "running";

  return (
    <div className="mb-4 flex items-center gap-3 rounded-card border border-[rgba(139,92,246,0.3)] bg-[rgba(139,92,246,0.06)] px-4 py-3">
      {running ? (
        <Loader2 size={16} className="animate-spin text-[var(--color-ai)] shrink-0" />
      ) : (
        <Sparkles size={16} className="text-[var(--color-ai)] shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--text-primary)]">
          {running
            ? `Breaking down ${run.projectName ?? "your script"}…`
            : `Breakdown ready to review`}
        </div>
        <div className="text-xs text-[var(--text-secondary)] tabular-nums">
          {running
            ? `Scene ${done}/${total} · you can keep working`
            : failed > 0
              ? `${run.scenes.length} scenes · ${failed} need a retry`
              : `${run.scenes.length} scenes analyzed`}
        </div>
      </div>
      <Button size="sm" variant="secondary" onClick={onOpen}>
        {running ? "View progress" : "Review"} <ArrowRight size={12} />
      </Button>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * Retry controls for the scenes that fell back to the offline heuristic. When
 * the fallback was caused by a provider limit, a countdown shows when a live
 * retry is worth attempting, and (if armed) fires it automatically.
 */
function RetryPanel({ run }: { run: BreakdownRunState }) {
  const retry = useStore((s) => s.retryBreakdownScenes);
  const setAutoRetry = useStore((s) => s.setBreakdownAutoRetry);
  const failed = run.failedScenes.length;
  const [remaining, setRemaining] = useState(0);

  // Tick the cooldown for display. The actual auto-retry is fired by an
  // always-mounted watcher in MainLayout, so it happens even when this dialog
  // is closed and the run is in the background.
  useEffect(() => {
    if (!run.cooldownUntil) {
      setRemaining(0);
      return;
    }
    const tick = () => setRemaining(Math.max(0, Math.round((run.cooldownUntil! - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [run.cooldownUntil]);

  if (failed === 0 && !run.retrying) return null;

  const cooling = remaining > 0;
  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div className="rounded-card border border-[var(--border-default)] bg-[var(--bg-surface)] p-3.5 space-y-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={16} className="text-[var(--color-warning)] shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[var(--text-primary)]">
            {run.retrying
              ? "Retrying the missing scenes…"
              : `${failed} scene${failed === 1 ? "" : "s"} used the offline fallback`}
          </div>
          <div className="text-xs text-[var(--text-secondary)] mt-0.5">
            {run.cooldownKind === "allowance"
              ? "The AI provider's allowance is used up. You can try again later, or keep the offline results."
              : run.cooldownKind === "rate"
                ? "The provider was rate-limited. A quick wait usually clears it."
                : "Re-run just these scenes to replace the offline guesses with a live analysis."}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant="ai"
          onClick={() => retry()}
          disabled={run.retrying}
          loading={run.retrying}
        >
          {!run.retrying && <RefreshCw size={13} />}
          {cooling ? `Retry now` : `Retry ${failed} scene${failed === 1 ? "" : "s"}`}
        </Button>

        {cooling && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-warning)] tabular-nums">
            <Clock size={13} /> auto-retry in {mm}:{ss}
          </span>
        )}

        {run.cooldownUntil && (
          <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer ml-auto">
            <input
              type="checkbox"
              checked={run.autoRetry}
              onChange={(e) => setAutoRetry(e.target.checked)}
              className="accent-[var(--color-ai)]"
            />
            Auto-retry when ready
          </label>
        )}
      </div>
    </div>
  );
}

/**
 * What the breakdown found, as records the user can accept.
 *
 * The run already produced a character bible and a consolidated location list;
 * without this step both are shown once and discarded, and the Cast and
 * Locations pages start empty even though the AI already did the work.
 */
function BreakdownResults({
  characters,
  locations,
  usedDemo,
  castSelection,
  onCastSelection,
  locationSelection,
  onLocationSelection,
}: {
  characters: ScriptCharacter[];
  locations: ProposedLocation[];
  usedDemo: boolean;
  castSelection: Set<string>;
  onCastSelection: (s: Set<string>) => void;
  locationSelection: Set<string>;
  onLocationSelection: (s: Set<string>) => void;
}) {
  const cast = useStore((s) => s.cast);
  const storeLocations = useStore((s) => s.locations);
  const scenes = useStore((s) => s.scenes);
  const [showNonSpeaking, setShowNonSpeaking] = useState(false);

  const toCastItem = (c: ScriptCharacter): ProposalItem => {
    const dupe = characterExists(c, cast);
    const sceneCount = castFromCharacter(c, scenes).scenes.length;
    return {
      key: c.name,
      label: c.name,
      detail: [
        c.aliases?.length ? `also ${c.aliases.join(", ")}` : "",
        c.description ?? "",
      ]
        .filter(Boolean)
        .join(" — "),
      badge: (
        <div className="flex items-center gap-1.5">
          <Badge tone={c.importance === "lead" ? "ai" : "muted"}>{c.importance}</Badge>
          {sceneCount > 0 && <Badge tone="muted">{sceneCount} sc.</Badge>}
        </div>
      ),
      existing: Boolean(dupe),
      existingLabel: "On cast list",
    };
  };

  const speaking = useMemo(
    () => characters.filter((c) => c.speaking).map(toCastItem),
    [characters, cast, scenes]
  );
  const nonSpeaking = useMemo(
    () => characters.filter((c) => !c.speaking).map(toCastItem),
    [characters, cast, scenes]
  );

  const locationItems: ProposalItem[] = useMemo(
    () =>
      locations.map((l) => ({
        key: l.name,
        label: l.name,
        detail: [l.aliases?.length ? `also ${l.aliases.join(", ")}` : "", l.suggestedNotes ?? ""]
          .filter(Boolean)
          .join(" — "),
        badge: (
          <div className="flex items-center gap-1.5">
            <Badge tone="neutral">{l.type}</Badge>
            {l.sceneNumbers?.length ? <Badge tone="muted">{l.sceneNumbers.length} sc.</Badge> : null}
          </div>
        ),
        existing: Boolean(locationExists(l, storeLocations)),
        existingLabel: "Recorded",
      })),
    [locations, storeLocations]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="text-sm text-[var(--text-secondary)] max-w-md">
          Pick what to add to the production — everything here is editable afterwards.
        </div>
        {usedDemo && (
          <Badge tone="ai">
            Demo mode — add a Claude or Gemini API key in AI Settings for live analysis
          </Badge>
        )}
      </div>

      {speaking.length + nonSpeaking.length > 0 && (
        <div className="space-y-2">
          <ProposalPicker
            items={showNonSpeaking ? [...speaking, ...nonSpeaking] : speaking}
            selected={castSelection}
            onChange={onCastSelection}
            groupLabel={`Cast list — ${speaking.length} speaking`}
            emptyMessage="No speaking characters were identified."
          />
          {nonSpeaking.length > 0 && (
            <button
              onClick={() => setShowNonSpeaking(!showNonSpeaking)}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              {showNonSpeaking ? "Hide" : "Show"} {nonSpeaking.length} non-speaking character
              {nonSpeaking.length === 1 ? "" : "s"}
            </button>
          )}
        </div>
      )}

      {locationItems.length > 0 && (
        <ProposalPicker
          items={locationItems}
          selected={locationSelection}
          onChange={onLocationSelection}
          groupLabel={`Locations — ${locationItems.length} consolidated`}
        />
      )}
    </div>
  );
}
