import React, { useState, useMemo, useEffect, useRef } from "react";
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
  SlidersHorizontal,
  ChevronDown,
  Search,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStore, activeProject } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn, formatDate } from "@/lib/utils";
import { aiBreakdownScene } from "@/lib/claude";
import { extractCharacters } from "@/lib/script";
import { useLocationNames } from "@/lib/locations";
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
  const shootDays = useStore((s) => s.shootDays);
  const updateScene = useStore((s) => s.updateScene);
  const addElement = useStore((s) => s.addElementToScene);
  const removeElement = useStore((s) => s.removeElementFromScene);
  const updateElement = useStore((s) => s.updateElement);
  const mergeAIProposal = useStore((s) => s.mergeAIProposalIntoScene);
  const recordAIUsage = useStore((s) => s.recordAIUsage);
  const locationNames = useLocationNames();

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

  // Scene -> shoot date, from the schedule
  const sceneDateMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const d of shootDays) for (const sceneId of d.scenes) m[sceneId] = d.date;
    return m;
  }, [shootDays]);

  const filterOptions = useMemo(() => {
    const locations = new Set<string>();
    const actors = new Set<string>();
    const dates = new Set<string>();
    for (const s of scenes) {
      locations.add(s.location);
      for (const el of s.elements) if (el.category === "cast") actors.add(el.name);
      const date = sceneDateMap[s.id];
      if (date) dates.add(date);
    }
    return {
      locations: Array.from(locations).sort(),
      actors: Array.from(actors).sort(),
      dates: Array.from(dates).sort(),
    };
  }, [scenes, sceneDateMap]);

  const [locationFilter, setLocationFilter] = useState<Set<string>>(new Set());
  const [timeFilter, setTimeFilter] = useState<Set<string>>(new Set());
  const [intExtFilter, setIntExtFilter] = useState<Set<string>>(new Set());
  const [actorFilter, setActorFilter] = useState<Set<string>>(new Set());
  const [dateFilter, setDateFilter] = useState<Set<string>>(new Set());

  const toggleInSet = (set: Set<string>, setter: (s: Set<string>) => void, value: string) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  const filterGroups: FilterGroupDef[] = [
    { key: "intExt", label: "INT/EXT", options: INT_EXT, selected: intExtFilter, setter: setIntExtFilter },
    { key: "time", label: "Time of day", options: TIMES, selected: timeFilter, setter: setTimeFilter },
    {
      key: "location",
      label: "Location",
      options: filterOptions.locations,
      selected: locationFilter,
      setter: setLocationFilter,
    },
    { key: "cast", label: "Cast", options: filterOptions.actors, selected: actorFilter, setter: setActorFilter },
    {
      key: "date",
      label: "Shoot date",
      options: filterOptions.dates,
      selected: dateFilter,
      setter: setDateFilter,
      format: (v) => formatDate(v, { weekday: "short" }),
    },
  ];

  const activeFilterCount = filterGroups.reduce((n, g) => n + g.selected.size, 0);

  const activeChips = filterGroups.flatMap((g) =>
    Array.from(g.selected).map((value) => ({
      key: `${g.key}:${value}`,
      group: g.label,
      label: g.format ? g.format(value) : value,
      remove: () => toggleInSet(g.selected, g.setter, value),
    }))
  );

  const clearFilters = () => {
    for (const g of filterGroups) g.setter(new Set());
  };

  const filteredScenes = useMemo(() => {
    return scenes.filter((s) => {
      if (locationFilter.size && !locationFilter.has(s.location)) return false;
      if (timeFilter.size && !timeFilter.has(s.timeOfDay)) return false;
      if (intExtFilter.size && !intExtFilter.has(s.intExt)) return false;
      if (actorFilter.size) {
        const sceneActors = s.elements.filter((el) => el.category === "cast").map((el) => el.name);
        if (!sceneActors.some((a) => actorFilter.has(a))) return false;
      }
      if (dateFilter.size) {
        const date = sceneDateMap[s.id];
        if (!date || !dateFilter.has(date)) return false;
      }
      return true;
    });
  }, [scenes, locationFilter, timeFilter, intExtFilter, actorFilter, dateFilter, sceneDateMap]);

  useEffect(() => {
    if (filteredScenes.length && !filteredScenes.find((s) => s.id === selectedSceneId)) {
      setSelectedSceneId(filteredScenes[0].id);
    }
  }, [filteredScenes, selectedSceneId]);

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

      {/* Filter toolbar */}
      <Card padding="sm" className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 pr-1 text-xs text-[var(--text-secondary)] shrink-0">
            <SlidersHorizontal size={13} />
            Filters
          </div>

          {filterGroups.map((g) => (
            <FilterDropdown
              key={g.key}
              label={g.label}
              options={g.options}
              selected={g.selected}
              format={g.format}
              onToggle={(v) => toggleInSet(g.selected, g.setter, v)}
              onClear={() => g.setter(new Set())}
            />
          ))}

          <div className="flex items-center gap-3 ml-auto shrink-0">
            <span className="text-xs text-[var(--text-muted)] tabular-nums">
              {activeFilterCount > 0
                ? `${filteredScenes.length} of ${scenes.length} scenes`
                : `${scenes.length} scenes`}
            </span>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 h-7 px-2 rounded-md text-xs text-[var(--text-secondary)] hover:text-[var(--color-danger)] hover:bg-[var(--bg-surface-hover)] transition-colors"
              >
                <X size={12} /> Clear all
              </button>
            )}
          </div>
        </div>

        {activeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5 border-t border-[var(--border-default)]">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                onClick={chip.remove}
                title={`Remove ${chip.group} filter “${chip.label}”`}
                className="group flex items-center gap-1 h-6 pl-2 pr-1.5 rounded-badge bg-[var(--active-tint)] text-[11px] text-[var(--accent-blue)] hover:bg-[rgba(79,123,247,0.18)] transition-colors"
              >
                <span className="opacity-60">{chip.group}</span>
                <span className="font-medium truncate max-w-[160px]">{chip.label}</span>
                <X size={11} className="opacity-50 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Scene list */}
        <div className="lg:col-span-1">
          <Card padding="sm" className="max-h-[calc(100vh-180px)] overflow-y-auto">
            <CardHeader
              title="Scenes"
              subtitle={
                activeFilterCount > 0 ? `${filteredScenes.length} of ${scenes.length} shown` : undefined
              }
              className="mb-2"
            />

            <div className="space-y-0.5">
              {filteredScenes.length === 0 && (
                <div className="text-center py-6 px-2">
                  <div className="text-xs text-[var(--text-muted)]">No scenes match these filters.</div>
                  <button
                    onClick={clearFilters}
                    className="mt-2 text-xs text-[var(--accent-blue)] hover:underline"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
              {filteredScenes.map((s) => (
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
                    list="known-locations"
                  />
                  <datalist id="known-locations">
                    {locationNames.map((l) => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
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

type FilterGroupDef = {
  key: string;
  label: string;
  options: readonly string[];
  selected: Set<string>;
  setter: (s: Set<string>) => void;
  format?: (value: string) => string;
};

/** Options become searchable once the list is long enough to need scrolling. */
const SEARCHABLE_AT = 8;

function FilterDropdown({
  label,
  options,
  selected,
  format,
  onToggle,
  onClear,
}: {
  label: string;
  options: readonly string[];
  selected: Set<string>;
  format?: (value: string) => string;
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  if (options.length === 0) return null;

  const searchable = options.length >= SEARCHABLE_AT;
  const shown = query
    ? options.filter((o) => (format ? format(o) : o).toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs transition-colors",
          selected.size
            ? "border-[var(--accent-blue)] bg-[var(--active-tint)] text-[var(--accent-blue)]"
            : "border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-surface-hover)]"
        )}
      >
        {label}
        {selected.size > 0 && (
          <span className="min-w-[16px] h-4 px-1 rounded-full bg-[var(--accent-blue)] text-white text-[9px] font-medium flex items-center justify-center leading-none">
            {selected.size}
          </span>
        )}
        <ChevronDown size={12} className={cn("opacity-60 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-20 left-0 mt-1 w-56 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-xl p-1.5">
          {searchable && (
            <div className="relative mb-1.5">
              <Search
                size={12}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
              />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                className="w-full h-7 text-xs pl-7"
              />
            </div>
          )}

          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {shown.length === 0 && (
              <div className="text-xs text-[var(--text-muted)] text-center py-3">No matches</div>
            )}
            {shown.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer px-1.5 py-1 rounded hover:bg-[var(--row-hover)]"
              >
                <input
                  type="checkbox"
                  checked={selected.has(opt)}
                  onChange={() => onToggle(opt)}
                  className="accent-[var(--accent-blue)] shrink-0"
                />
                <span className="truncate">{format ? format(opt) : opt}</span>
              </label>
            ))}
          </div>

          {selected.size > 0 && (
            <div className="mt-1 pt-1 border-t border-[var(--border-default)]">
              <button
                onClick={onClear}
                className="w-full text-left text-[11px] text-[var(--text-muted)] hover:text-[var(--color-danger)] px-1.5 py-1"
              >
                Clear {label.toLowerCase()}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
