import React, { useState, useRef } from "react";
import {
  FolderKanban,
  Plus,
  Upload,
  FileText,
  Sparkles,
  Trash2,
  ArrowRight,
  Loader2,
  Check,
  Film,
  Pencil,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStore } from "@/state/store";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { formatDate } from "@/lib/utils";
import { extractPdfText, parseScreenplay, runBreakdown, type BreakdownProgress } from "@/lib/script";
import type { ScriptCharacter } from "@/lib/claude";
import type { Scene } from "@/types";

const CURRENCIES = ["AED", "USD", "EUR", "GBP", "INR", "CAD"];

type UploadStage = "input" | "parsing" | "parsed" | "running" | "done" | "error";

export function Projects() {
  const nav = useNavigate();
  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const createProject = useStore((s) => s.createProject);
  const switchProject = useStore((s) => s.switchProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const renameProject = useStore((s) => s.renameProject);
  const setProjectScript = useStore((s) => s.setProjectScript);
  const replaceScenes = useStore((s) => s.replaceScenes);
  const recordAIUsage = useStore((s) => s.recordAIUsage);

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
  const [progress, setProgress] = useState<BreakdownProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [usedDemo, setUsedDemo] = useState(false);
  const [failedScenes, setFailedScenes] = useState<{ sceneNumber: string; error: string }[]>([]);
  const [foundCharacters, setFoundCharacters] = useState<ScriptCharacter[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

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
    setStage("input");
    setPasteText("");
    setFileName("");
    setRawText("");
    setSource("paste");
    setParsed([]);
    setPageCount(undefined);
    setProgress(null);
    setErrorMsg("");
    setUsedDemo(false);
    setFailedScenes([]);
  };

  const closeUpload = () => {
    if (stage === "running" || stage === "parsing") return;
    setUploadFor(null);
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

  const run = async () => {
    setStage("running");
    setProgress({ done: 0, total: parsed.length, currentSceneNumber: "", stage: "characters" });
    try {
      const projectName = projects.find((p) => p.id === uploadFor)?.name;
      const { scenes, usage, fromMock, failedScenes: failed, characters } = await runBreakdown(
        parsed,
        setProgress,
        projectName
      );
      replaceScenes(scenes);
      setFailedScenes(failed);
      setFoundCharacters(characters);
      setProjectScript({
        fileName: source === "pdf" ? fileName : undefined,
        rawText,
        uploadedAt: new Date().toISOString(),
        pageCount,
        source,
      });
      usage.forEach((u) => recordAIUsage(u));
      setUsedDemo(fromMock);
      setStage("done");
    } catch (e) {
      setErrorMsg((e as Error).message || "Breakdown failed.");
      setStage("error");
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="section-header">Productions</div>
          <div className="page-title mt-1">Projects</div>
        </div>
        <Button onClick={openCreate}>
          <Plus size={14} /> New project
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            icon={<FolderKanban size={48} />}
            title="Create your first production"
            subtitle="A project holds one script and its full breakdown. Create one, then upload a screenplay to generate scenes, cast, locations, props and more — automatically."
            cta={
              <Button onClick={openCreate}>
                <Plus size={14} /> New project
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <Card key={p.id} className="relative flex flex-col">
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
                        className="h-7 text-sm w-full"
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
          ))}
        </div>
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
        open={!!uploadFor}
        onClose={closeUpload}
        title="Upload script → AI breakdown"
        subtitle="Upload a PDF screenplay or paste the text. SceneTrackable extracts every scene and element."
        size="lg"
        footer={
          stage === "input" ? (
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
          ) : stage === "done" ? (
            <Button
              onClick={() => {
                setUploadFor(null);
                nav("/breakdown");
              }}
            >
              View breakdown <ArrowRight size={14} />
            </Button>
          ) : stage === "error" ? (
            <Button variant="secondary" onClick={() => setStage("input")}>
              Try again
            </Button>
          ) : null
        }
      >
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
              vehicles, animals, locations and production requirements.
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

        {stage === "running" && progress && (
          <div className="py-8 space-y-4">
            <div className="flex flex-col items-center gap-2">
              <Sparkles size={28} className="text-[var(--color-ai)] animate-pulse" />
              <div className="text-sm font-medium text-[var(--text-primary)]">
                {progress.stage === "characters"
                  ? "Reading the script for characters"
                  : `Analyzing scene ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`}
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                {progress.stage === "characters"
                  ? "One pass over the whole screenplay so cast naming stays consistent"
                  : progress.currentSceneNumber
                    ? `Scene ${progress.currentSceneNumber}`
                    : ""}
              </div>
            </div>
            {/* The character pass has no per-scene progress, so show it as a
                small definite slice rather than a bar that sits at zero. */}
            <ProgressBar
              value={
                progress.stage === "characters"
                  ? 6
                  : progress.total
                    ? 6 + (progress.done / progress.total) * 94
                    : 6
              }
            />
            <div className="text-center text-xs text-[var(--text-muted)]">
              Keep this open — larger scripts take a moment.
            </div>
          </div>
        )}

        {stage === "done" && (
          <div className="py-8 flex flex-col items-center gap-3 text-center">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: "rgba(34,197,94,0.12)" }}
            >
              <Check size={28} className="text-[var(--color-success)]" />
            </div>
            <div className="text-lg font-semibold text-[var(--text-primary)]">Breakdown complete</div>
            <div className="text-sm text-[var(--text-secondary)] max-w-sm">
              {parsed.length} scenes analyzed
              {foundCharacters.length > 0 && (
                <>
                  {" "}
                  and {foundCharacters.length} character
                  {foundCharacters.length > 1 ? "s" : ""} identified
                  {(() => {
                    const speaking = foundCharacters.filter((c) => c.speaking).length;
                    return speaking ? ` (${speaking} speaking)` : "";
                  })()}
                </>
              )}
              . Every element is now editable in the Breakdown workspace.
            </div>
            {usedDemo && (
              <Badge tone="ai">
                Demo mode — add a Claude or Gemini API key in AI Settings for live analysis
              </Badge>
            )}
            {failedScenes.length > 0 && (
              <div className="text-xs text-[var(--color-warning,#F59E0B)] max-w-sm">
                {failedScenes.length} scene{failedScenes.length > 1 ? "s" : ""} could not be
                analyzed live and used the offline fallback ({failedScenes[0].error}). Re-run
                the breakdown, or re-analyze those scenes individually in the Breakdown page.
              </div>
            )}
          </div>
        )}

        {stage === "error" && (
          <EmptyState icon={<Film size={40} />} title="Couldn't parse the script" subtitle={errorMsg} />
        )}
      </Modal>
    </div>
  );
}
