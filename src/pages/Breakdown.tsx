import React, { useState, useMemo, useEffect } from "react";
import {
  Film,
  Sparkles,
  Plus,
  Trash2,
  Check,
  Loader2,
  Upload,
  FileDown,
  Printer,
  AlertTriangle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStore, activeProject } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { aiBreakdownScene } from "@/lib/claude";
import { extractCharacters } from "@/lib/script";
import { exportBreakdownCSV, printBreakdownSheets } from "@/lib/export";
import type { ElementCategory, BreakdownElement } from "@/types";

const CATEGORY_META: Record<ElementCategory, { label: string; color: string }> = {
  cast: { label: "Cast", color: "#4F7BF7" },
  extras: { label: "Extras", color: "#38BDF8" },
  props: { label: "Props", color: "#22C55E" },
  wardrobe: { label: "Wardrobe", color: "#EC4899" },
  sfx: { label: "SFX", color: "#EF4444" },
  vfx: { label: "VFX", color: "#8B5CF6" },
  vehicles: { label: "Vehicles", color: "#F59E0B" },
  animals: { label: "Animals", color: "#84CC16" },
  locations: { label: "Locations", color: "#14B8A6" },
  makeup: { label: "Makeup", color: "#F97316" },
  stunts: { label: "Stunts", color: "#DC2626" },
  production: { label: "Production Req.", color: "#94A3B8" },
};
const CATEGORIES = Object.keys(CATEGORY_META) as ElementCategory[];
const INT_EXT: ("INT" | "EXT" | "INT/EXT")[] = ["INT", "EXT", "INT/EXT"];
const TIMES: ("DAY" | "NIGHT" | "DAWN" | "DUSK")[] = ["DAY", "NIGHT", "DAWN", "DUSK"];

const cellCls =
  "w-full bg-transparent text-sm text-[var(--text-primary)] border border-transparent hover:border-[var(--border-default)] focus:border-[var(--accent-blue)] rounded px-1.5 py-1 transition-colors";

export function Breakdown() {
  const nav = useNavigate();
  const project = useStore(activeProject);
  const scenes = useStore((s) => s.scenes);
  const updateScene = useStore((s) => s.updateScene);
  const addElement = useStore((s) => s.addElementToScene);
  const removeElement = useStore((s) => s.removeElementFromScene);
  const updateElement = useStore((s) => s.updateElement);
  const mergeAIProposal = useStore((s) => s.mergeAIProposalIntoScene);
  const recordAIUsage = useStore((s) => s.recordAIUsage);

  const [selectedSceneId, setSelectedSceneId] = useState<string>(scenes[0]?.id ?? "");
  useEffect(() => {
    if (!scenes.find((s) => s.id === selectedSceneId)) setSelectedSceneId(scenes[0]?.id ?? "");
  }, [scenes, selectedSceneId]);

  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiProposal, setAiProposal] = useState<
    | null
    | { elements: (BreakdownElement & { accepted: boolean })[]; mock: boolean }
  >(null);

  const scene = scenes.find((s) => s.id === selectedSceneId);

  const grouped = useMemo(() => {
    const g: Partial<Record<ElementCategory, BreakdownElement[]>> = {};
    if (scene) for (const el of scene.elements) (g[el.category] ??= []).push(el);
    return g;
  }, [scene]);

  const totalElements = useMemo(() => scenes.reduce((n, s) => n + s.elements.length, 0), [scenes]);

  const runAI = async () => {
    if (!scene) return;
    setAiLoading(true);
    setAiModalOpen(true);
    setAiProposal(null);
    setAiError("");
    try {
      const { proposal, result } = await aiBreakdownScene(scene, {
        characters: extractCharacters(scenes),
        projectName: project?.name,
      });
      recordAIUsage({
        feature: "script_breakdown",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        model: result.model,
        costUsd: result.costUsd,
      });
      setAiProposal({
        elements: proposal.elements.map((e) => ({
          id: Math.random().toString(36).slice(2),
          name: e.name,
          category: e.category,
          subCategory: e.subCategory,
          description: e.description,
          notes: e.notes,
          accepted: true,
        })),
        mock: result.fromMock,
      });
    } catch (err) {
      setAiProposal(null);
      setAiError((err as Error).message || "The AI request failed.");
    } finally {
      setAiLoading(false);
    }
  };

  const commitAI = () => {
    if (!scene || !aiProposal) return;
    const accepted = aiProposal.elements
      .filter((e) => e.accepted)
      .map(({ name, category, subCategory, description, notes }) => ({
        name,
        category,
        subCategory,
        description,
        notes,
      }));
    mergeAIProposal(scene.id, accepted);
    setAiModalOpen(false);
    setAiProposal(null);
  };

  if (!project || scenes.length === 0) {
    return (
      <div className="max-w-[1000px] mx-auto">
        <div className="mb-6">
          <div className="section-header">Script Breakdown</div>
          <div className="page-title mt-1">Scene Analysis</div>
        </div>
        <Card padding="lg">
          <EmptyState
            icon={<Film size={48} />}
            title={project ? "No script yet" : "No project selected"}
            subtitle={
              project
                ? `Upload a screenplay for “${project.name}” to generate scenes and a full element breakdown.`
                : "Create or open a project, then upload its script to generate the breakdown."
            }
            cta={
              <Button onClick={() => nav("/projects")}>
                <Upload size={14} /> Go to Projects
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-[1500px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="section-header">Script Breakdown · {project.name}</div>
          <div className="page-title mt-1">
            {scenes.length} scenes · {totalElements} elements
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => exportBreakdownCSV(project.name, scenes)}
            disabled={scenes.length === 0}
          >
            <FileDown size={14} /> CSV
          </Button>
          <Button
            variant="secondary"
            onClick={() => printBreakdownSheets(project.name, scenes)}
            disabled={scenes.length === 0}
          >
            <Printer size={14} /> Breakdown sheets
          </Button>
          <Button variant="ai" onClick={runAI} disabled={!scene}>
            <Sparkles size={14} /> Re-analyze scene
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Scene list */}
        <div className="lg:col-span-1">
          <Card padding="sm" className="max-h-[calc(100vh-180px)] overflow-y-auto">
            <CardHeader title="Scenes" />
            <div className="space-y-0.5">
              {scenes.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSceneId(s.id)}
                  className={cn(
                    "w-full text-left p-2 rounded-lg text-xs transition-colors",
                    s.id === selectedSceneId
                      ? "bg-[var(--active-tint)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-[var(--text-muted)] w-6 shrink-0">
                      {s.number}
                    </span>
                    <span className="truncate flex-1">{s.location}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-1 pl-7">
                    <span className="text-[9px] text-[var(--text-muted)]">
                      {s.intExt} · {s.timeOfDay}
                    </span>
                    {s.vfxFlags && <span className="w-1.5 h-1.5 rounded-full" style={{ background: CATEGORY_META.vfx.color }} />}
                    {s.sfxFlags && <span className="w-1.5 h-1.5 rounded-full" style={{ background: CATEGORY_META.sfx.color }} />}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* Detail */}
        <div className="lg:col-span-4 space-y-3">
          {scene && (
            <>
              {/* Scene header (editable) */}
              <Card>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <span className="text-xl font-semibold font-mono text-[var(--text-primary)]">
                    {scene.number}
                  </span>
                  <select
                    value={scene.intExt}
                    onChange={(e) => updateScene(scene.id, { intExt: e.target.value as typeof scene.intExt })}
                    className="h-8 text-xs"
                  >
                    {INT_EXT.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                  <select
                    value={scene.timeOfDay}
                    onChange={(e) => updateScene(scene.id, { timeOfDay: e.target.value as typeof scene.timeOfDay })}
                    className="h-8 text-xs"
                  >
                    {TIMES.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                  <input
                    value={scene.location}
                    onChange={(e) => updateScene(scene.id, { location: e.target.value })}
                    className="h-8 text-sm flex-1 min-w-[200px]"
                    placeholder="Location"
                  />
                  <span className="text-xs text-[var(--text-secondary)]">
                    {scene.pages} pg · ~{scene.estimatedShootMinutes}min
                  </span>
                </div>
                <textarea
                  value={scene.notes ?? ""}
                  onChange={(e) => updateScene(scene.id, { notes: e.target.value })}
                  placeholder="Scene notes…"
                  className="w-full text-xs h-16 resize-none"
                />
              </Card>

              {/* Elements editable table */}
              <Card padding="none">
                <div className="p-4 flex items-center justify-between">
                  <CardHeader
                    title="Breakdown Elements"
                    subtitle={`${scene.elements.length} elements`}
                    className="mb-0"
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wide text-[var(--text-muted)] border-y border-[var(--border-default)]">
                        <th className="px-3 py-2 w-40">Category</th>
                        <th className="px-2 py-2">Name</th>
                        <th className="px-2 py-2 w-40">Sub-category</th>
                        <th className="px-2 py-2">Description</th>
                        <th className="px-2 py-2 w-40">Notes</th>
                        <th className="px-2 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {CATEGORIES.filter((c) => grouped[c]).map((cat) =>
                        grouped[cat]!.map((el, i) => (
                          <tr key={el.id} className="border-b border-[var(--border-default)] last:border-b-0 hover:bg-[var(--row-hover)]">
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CATEGORY_META[cat].color }} />
                                <select
                                  value={el.category}
                                  onChange={(e) => updateElement(scene.id, el.id, { category: e.target.value as ElementCategory })}
                                  className="h-7 text-xs bg-transparent border-transparent hover:border-[var(--border-default)]"
                                >
                                  {CATEGORIES.map((c) => (
                                    <option key={c} value={c}>{CATEGORY_META[c].label}</option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                value={el.name}
                                onChange={(e) => updateElement(scene.id, el.id, { name: e.target.value })}
                                className={cellCls}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                value={el.subCategory ?? ""}
                                onChange={(e) => updateElement(scene.id, el.id, { subCategory: e.target.value })}
                                className={cellCls}
                                placeholder="—"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                value={el.description ?? ""}
                                onChange={(e) => updateElement(scene.id, el.id, { description: e.target.value })}
                                className={cellCls}
                                placeholder="—"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                value={el.notes ?? ""}
                                onChange={(e) => updateElement(scene.id, el.id, { notes: e.target.value })}
                                className={cellCls}
                                placeholder="—"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <button
                                onClick={() => removeElement(scene.id, el.id)}
                                className="text-[var(--text-muted)] hover:text-[var(--color-danger)]"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                      {scene.elements.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">
                            No elements yet. Add one below or re-analyze the scene.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="p-3 border-t border-[var(--border-default)]">
                  <Button variant="secondary" size="sm" onClick={() => addElement(scene.id, "New element", "props")}>
                    <Plus size={12} /> Add element
                  </Button>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* AI proposal modal */}
      <Modal
        open={aiModalOpen}
        onClose={() => {
          setAiModalOpen(false);
          setAiProposal(null);
        }}
        title="AI Scene Analysis"
        subtitle={scene ? `Scene ${scene.number} — ${scene.location}` : ""}
        size="lg"
        footer={
          aiProposal && (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setAiModalOpen(false);
                  setAiProposal(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={commitAI}>
                <Check size={14} /> Add selected ({aiProposal.elements.filter((e) => e.accepted).length})
              </Button>
            </>
          )
        }
      >
        {aiLoading ? (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 size={32} className="animate-spin text-[var(--color-ai)]" />
            <div className="text-sm text-[var(--text-secondary)]">Analyzing scene…</div>
          </div>
        ) : aiProposal ? (
          <div className="space-y-2">
            {aiProposal.mock && (
              <Badge tone="ai">Demo mode — add an API key in AI Settings for live analysis</Badge>
            )}
            {aiProposal.elements.map((el, i) => (
              <label
                key={el.id}
                className={cn(
                  "flex items-center gap-3 p-2.5 rounded-lg border transition-colors cursor-pointer",
                  el.accepted
                    ? "border-[var(--accent-blue)] bg-[var(--active-tint)]"
                    : "border-[var(--border-default)] opacity-50"
                )}
              >
                <input
                  type="checkbox"
                  checked={el.accepted}
                  onChange={() =>
                    setAiProposal((prev) =>
                      prev
                        ? {
                            ...prev,
                            elements: prev.elements.map((e, j) =>
                              j === i ? { ...e, accepted: !e.accepted } : e
                            ),
                          }
                        : prev
                    )
                  }
                  className="accent-[var(--accent-blue)]"
                />
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CATEGORY_META[el.category].color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    {el.name}
                    {el.subCategory && <span className="text-[var(--text-muted)] font-normal"> · {el.subCategory}</span>}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {CATEGORY_META[el.category].label}
                    {el.description ? ` — ${el.description}` : ""}
                  </div>
                </div>
              </label>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<AlertTriangle size={40} />}
            title="Analysis failed"
            subtitle={aiError || "Something went wrong. Try again."}
          />
        )}
      </Modal>
    </div>
  );
}
