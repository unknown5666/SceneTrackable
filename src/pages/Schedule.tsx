import React, { useState, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Calendar,
  Send,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Sun,
  Moon,
  MapPin,
  Users,
  Wand2,
  Sparkles,
  Loader2,
  Check,
} from "lucide-react";
import { useStore, activeProject } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { useRecordEditor } from "@/components/ui/RecordEditor";
import { formatDate, cn } from "@/lib/utils";
import { aiScheduleDraft } from "@/lib/claude";
import {
  buildScheduleDigest,
  defaultStartDate,
  demoScheduleDraft,
  shootDayFromProposal,
  validateSchedule,
  type ScheduleValidation,
} from "@/lib/scheduleDraft";
import type { ProductionData, Scene, ShootDay, DoodStatus } from "@/types";

// ============================================================
// STRIP BOARD
// ============================================================

const normLoc = (v?: string) => (v ?? "").trim().toLowerCase();

// A day with no location set holds any scene.
const sceneFitsDay = (scene: Scene, day: ShootDay) =>
  !normLoc(day.location) || normLoc(scene.location) === normLoc(day.location);

export function Schedule() {
  const [tab, setTab] = useState("board");

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="section-header">Schedule</div>
          <div className="page-title mt-1">Strip Board & DOOD</div>
        </div>
        <PublishButton />
      </div>

      <Tabs
        tabs={[
          { id: "board", label: "Strip Board" },
          { id: "dood", label: "Day Out Of Days" },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-6"
      />

      {tab === "board" ? <StripBoard /> : <DOODChart />}
    </div>
  );
}

function PublishButton() {
  const publishSchedule = useStore((s) => s.publishSchedule);
  const pub = useStore((s) => s.publishedSchedule);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-3">
        {pub.publishedAt && (
          <div className="text-xs text-[var(--text-muted)]">
            v{pub.version} · {formatDate(pub.publishedAt)}
          </div>
        )}
        <Button onClick={() => setConfirmOpen(true)}>
          <Send size={14} /> Publish Schedule
        </Button>
      </div>
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Publish Schedule"
        subtitle={`${pub.lastChanges.length} changes since last publish`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={() => { publishSchedule(); setConfirmOpen(false); }}>Publish v{pub.version + 1}</Button>
          </>
        }
      >
        {pub.lastChanges.length === 0 ? (
          <div className="text-sm text-[var(--text-secondary)]">No changes to publish.</div>
        ) : (
          <div className="space-y-2">
            {pub.lastChanges.map((c, i) => (
              <div key={i} className="text-sm text-[var(--text-primary)] flex items-center gap-2">
                <span className="text-[var(--text-muted)]">Scene {c.sceneId.replace("scene_", "")}</span>
                <span>Day {c.fromDay}</span>
                <ChevronRight size={12} className="text-[var(--text-muted)]" />
                <span>Day {c.toDay}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

function StripBoard() {
  const scenes = useStore((s) => s.scenes);
  const shootDays = useStore((s) => s.shootDays);
  const moveScene = useStore((s) => s.moveSceneToDay);
  const production = useStore((s) => s.production);

  const [activeDrag, setActiveDrag] = useState<string | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const ed = useRecordEditor("shootDays");

  // Page range for horizontal scroll
  const [startDay, setStartDay] = useState(
    Math.max(1, production.currentShootDay - 2)
  );
  const visibleDays = 7;
  const lastDay = shootDays.reduce((m, d) => Math.max(m, d.dayNumber), 0);
  const visibleShootDays = shootDays.filter(
    (d) => d.dayNumber >= startDay && d.dayNumber < startDay + visibleDays
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDrag(e.active.id as string);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over) return;
    const sceneId = active.id as string;
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    const overIdStr = over.id as string;
    // over ID = day column ID = "day_N" or another scene
    const dayMatch = overIdStr.match(/^day_(\d+)$/);
    if (dayMatch) {
      const targetDay = shootDays.find((d) => d.dayNumber === parseInt(dayMatch[1], 10));
      if (!targetDay || !sceneFitsDay(scene, targetDay)) return;
      moveScene(sceneId, targetDay.dayNumber);
    } else {
      // Dropped on another scene strip — find that scene's day
      const targetDay = shootDays.find((d) => d.scenes.includes(overIdStr));
      if (!targetDay || !sceneFitsDay(scene, targetDay)) return;
      const idx = targetDay.scenes.indexOf(overIdStr);
      moveScene(sceneId, targetDay.dayNumber, idx);
    }
  };

  const dragScene = activeDrag ? scenes.find((s) => s.id === activeDrag) : null;

  if (shootDays.length === 0) {
    return (
      <>
        <Card>
          <EmptyState
            icon={<Calendar size={48} />}
            title="No shoot days yet"
            subtitle={
              scenes.length > 0
                ? "Draft a board from your scenes — grouped by location, with nights batched together — then adjust it. Or add days by hand."
                : "Add your shooting days first — the strip board, DOOD, frequencies and kit assignments all hang off them."
            }
            cta={
              <div className="flex items-center gap-2">
                {scenes.length > 0 && (
                  <Button variant="ai" onClick={() => setDraftOpen(true)}>
                    <Sparkles size={14} /> Draft schedule (AI)
                  </Button>
                )}
                <ed.AddButton size="md" label="Add First Shoot Day" />
              </div>
            }
          />
        </Card>
        {ed.modal}
        <DraftScheduleModal open={draftOpen} onClose={() => setDraftOpen(false)} />
      </>
    );
  }

  return (
    <>
      {/* Pager */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-[var(--text-secondary)]">
          Showing Days {startDay}–{Math.min(startDay + visibleDays - 1, lastDay)} of {lastDay}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={startDay <= 1}
            onClick={() => setStartDay((v) => Math.max(1, v - visibleDays))}
          >
            <ChevronLeft size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={startDay + visibleDays > lastDay}
            onClick={() =>
              setStartDay((v) => Math.min(Math.max(1, lastDay - visibleDays + 1), v + visibleDays))
            }
          >
            <ChevronRight size={14} />
          </Button>
          <div className="ml-2 flex items-center gap-2">
            {scenes.length > 0 && (
              <Button variant="ai" size="sm" onClick={() => setDraftOpen(true)}>
                <Sparkles size={14} /> Draft schedule (AI)
              </Button>
            )}
            <ed.AddButton label="Add Day" />
          </div>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${visibleDays}, minmax(160px, 1fr))` }}>
          {visibleShootDays.map((day) => {
            const assigned = day.scenes.map((sid) => scenes.find((s) => s.id === sid)!).filter(Boolean);
            const dayScenes = assigned.filter((sc) => sceneFitsDay(sc, day));
            const offLocationCount = assigned.length - dayScenes.length;
            const totalPages = dayScenes.reduce((s, sc) => s + sc.pages, 0);
            const isToday = day.dayNumber === production.currentShootDay;

            return (
              <div
                key={day.id}
                className={cn(
                  "rounded-card border min-h-[300px] flex flex-col",
                  isToday
                    ? "border-[var(--accent-blue)]"
                    : "border-[var(--border-default)]"
                )}
                style={{ background: "var(--bg-surface)" }}
              >
                {/* Column header */}
                <div
                  className={cn(
                    "p-3 border-b border-[var(--border-default)]",
                    isToday && "bg-[var(--active-tint)]"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-[var(--text-primary)]">
                      Day {day.dayNumber}
                    </div>
                    <div className="flex items-center gap-1">
                      {isToday && <Badge tone="info">Today</Badge>}
                      <ed.RowActions id={day.id} />
                    </div>
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    {formatDate(day.date)} · {day.callTime}–{day.wrapTime}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)] mt-1 truncate flex items-center gap-1">
                    <MapPin size={8} /> {day.location}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    {totalPages.toFixed(1)} pages · ~{day.estimatedHours}h
                  </div>
                </div>

                {/* Banners */}
                {day.banners?.map((b, i) => (
                  <div
                    key={i}
                    className="px-3 py-1.5 text-[10px] font-medium border-b border-[var(--border-default)]"
                    style={{
                      background:
                        b.type === "day_off"
                          ? "rgba(239,68,68,0.08)"
                          : b.type === "company_move"
                          ? "rgba(245,158,11,0.08)"
                          : "rgba(79,123,247,0.08)",
                      color:
                        b.type === "day_off"
                          ? "var(--color-danger)"
                          : b.type === "company_move"
                          ? "var(--color-warning)"
                          : "var(--accent-blue)",
                    }}
                  >
                    {b.label}
                  </div>
                ))}

                {/* Scene strips droppable zone */}
                {offLocationCount > 0 && (
                  <div
                    className="px-3 py-1.5 text-[10px] font-medium border-b border-[var(--border-default)]"
                    style={{ background: "rgba(245,158,11,0.08)", color: "var(--color-warning)" }}
                    title={assigned
                      .filter((sc) => !sceneFitsDay(sc, day))
                      .map((sc) => `${sc.number} — ${sc.location}`)
                      .join("\n")}
                  >
                    {offLocationCount} scene{offLocationCount > 1 ? "s" : ""} hidden (other location)
                  </div>
                )}

                <SortableContext
                  items={dayScenes.map((sc) => sc.id)}
                  strategy={verticalListSortingStrategy}
                  id={`day_${day.dayNumber}`}
                >
                  <div
                    className="flex-1 p-1.5 space-y-1 min-h-[80px]"
                    data-droppable-id={`day_${day.dayNumber}`}
                  >
                    {dayScenes.map((sc) => (
                      <SceneStrip key={sc.id} scene={sc} />
                    ))}
                    {dayScenes.length === 0 && (
                      <div className="text-center text-[10px] text-[var(--text-muted)] py-6">
                        Drop scenes here
                      </div>
                    )}
                  </div>
                </SortableContext>
              </div>
            );
          })}
        </div>

        <DragOverlay>
          {dragScene && (
            <div
              className="rounded-lg p-2 border-2 text-xs shadow-lg"
              style={{
                borderColor: "var(--accent-blue)",
                background: "var(--bg-elevated)",
                transform: "scale(1.02)",
                width: 150,
              }}
            >
              <div className="font-mono font-semibold text-[var(--text-primary)]">
                {dragScene.number}
              </div>
              <div className="text-[10px] text-[var(--text-secondary)] truncate">
                {dragScene.location}
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {ed.modal}
      <DraftScheduleModal open={draftOpen} onClose={() => setDraftOpen(false)} />
    </>
  );
}

// ============================================================
// AI SCHEDULE DRAFT
// ============================================================

/**
 * Drafts a whole strip board in one request, shows it for review, and only
 * writes shoot days once accepted.
 *
 * Overwriting is deliberately hard to do by accident: published days are never
 * touched, and replacing unpublished ones takes an explicit choice.
 */
function DraftScheduleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const scenes = useStore((s) => s.scenes);
  const shootDays = useStore((s) => s.shootDays);
  const publishedSchedule = useStore((s) => s.publishedSchedule);
  const project = useStore(activeProject);
  const addRecord = useStore((s) => s.addRecord);
  const deleteRecord = useStore((s) => s.deleteRecord);
  const recordAIUsage = useStore((s) => s.recordAIUsage);

  const data = useScheduleData();
  const [startDate, setStartDate] = useState(() => defaultStartDate(data));
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScheduleValidation | null>(null);
  const [fromMock, setFromMock] = useState(false);
  const [error, setError] = useState("");

  // A published board has gone out to departments; redrafting over it would
  // silently contradict call sheets people are already working from.
  const isPublished = Boolean(publishedSchedule.publishedAt);
  const hasDays = shootDays.length > 0;

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const digest = buildScheduleDigest(data, startDate, scenes);
      const { days, result: res } = await aiScheduleDraft(digest, project?.name);
      recordAIUsage({
        feature: "schedule_draft",
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        model: res.model,
        costUsd: res.costUsd,
      });
      const mock = res.fromMock || days.length === 0;
      const proposed = mock ? demoScheduleDraft(data, scenes, startDate) : days;
      setFromMock(mock);
      setResult(validateSchedule(proposed, scenes, startDate));
    } catch (e) {
      setError((e as Error).message || "Couldn't draft a schedule.");
    } finally {
      setBusy(false);
    }
  };

  const accept = () => {
    if (!result) return;
    if (replace) {
      for (const day of shootDays) deleteRecord("shootDays", day.id);
    }
    for (const v of result.days) addRecord("shootDays", shootDayFromProposal(v));
    close();
  };

  const close = () => {
    setResult(null);
    setError("");
    setReplace(false);
    setFromMock(false);
    onClose();
  };

  const totalPages = result?.days.reduce((s, d) => s + d.pages, 0) ?? 0;

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : close}
      size="lg"
      title="Draft a shooting schedule"
      subtitle="One AI pass over every scene — grouped by location to cut company moves, nights batched together, packed to your page target."
      footer={
        result ? (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={accept} disabled={result.days.length === 0}>
              <Check size={14} /> Create {result.days.length} shoot day
              {result.days.length === 1 ? "" : "s"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="ai" onClick={run} disabled={busy || scenes.length === 0}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {busy ? "Building the board…" : "Draft schedule"}
            </Button>
          </>
        )
      }
    >
      {error ? (
        <EmptyState icon={<Calendar size={40} />} title="Couldn't draft a schedule" subtitle={error} />
      ) : result ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="success" dot>
              {result.days.length} days · {Math.round(totalPages * 10) / 10} pages
            </Badge>
            {result.unplaced.length > 0 && (
              <Badge tone="warning">{result.unplaced.length} scenes unplaced</Badge>
            )}
            {fromMock && <Badge tone="ai">Demo mode — grouped by location and time of day</Badge>}
          </div>

          {hasDays && (
            <div
              className="p-3 rounded-lg border"
              style={{
                borderColor: isPublished ? "var(--color-danger)" : "var(--border-default)",
                background: "var(--bg-elevated)",
              }}
            >
              {isPublished ? (
                <div className="text-xs text-[var(--text-secondary)]">
                  <span className="font-medium text-[var(--color-danger)]">
                    This schedule is published (v{publishedSchedule.version}).
                  </span>{" "}
                  Departments are working from it, so these days will be <strong>added</strong>{" "}
                  alongside the existing {shootDays.length}. Delete the old days yourself if you
                  mean to replace them.
                </div>
              ) : (
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={replace}
                    onChange={(e) => setReplace(e.target.checked)}
                  />
                  <span className="text-[var(--text-secondary)]">
                    Replace the {shootDays.length} existing unpublished shoot day
                    {shootDays.length === 1 ? "" : "s"}. Leave unchecked to add these alongside
                    them.
                  </span>
                </label>
              )}
            </div>
          )}

          <div className="rounded-card border border-[var(--border-default)] divide-y divide-[var(--border-default)] max-h-[340px] overflow-y-auto">
            {result.days.map((v) => (
              <div key={v.day.dayNumber} className="p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    Day {v.day.dayNumber}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {formatDate(v.day.date, { year: "numeric" })}
                  </span>
                  <Badge tone="muted">
                    <MapPin size={9} /> {v.day.location}
                  </Badge>
                  <Badge tone="neutral">
                    {v.pages} pg · ~{v.day.estimatedHours}h
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {v.scenes.map((s) => (
                    <span
                      key={s.id}
                      className="text-[10px] px-1.5 py-0.5 rounded-badge bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)]"
                    >
                      {s.number}
                      {s.timeOfDay === "NIGHT" ? " 🌙" : ""}
                    </span>
                  ))}
                </div>
                {v.day.rationale && (
                  <div className="text-[11px] text-[var(--text-muted)] mt-1.5">
                    {v.day.rationale}
                  </div>
                )}
              </div>
            ))}
          </div>

          {result.unplaced.length > 0 && (
            <div className="text-[11px] text-[var(--text-muted)]">
              Left unplaced (they stay in the unassigned pool):{" "}
              {result.unplaced.map((s) => s.number).join(", ")}.
            </div>
          )}
          {result.problems.length > 0 && (
            <div className="text-[11px] text-[var(--color-warning)]">
              Fixed while validating: {result.problems.slice(0, 3).join(" ")}
              {result.problems.length > 3 && ` +${result.problems.length - 3} more.`}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="section-header block mb-1.5">First shooting day</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full"
            />
            <div className="text-[11px] text-[var(--text-muted)] mt-1">
              Days run Monday–Friday from here.
            </div>
          </div>
          <div className="text-sm text-[var(--text-secondary)]">
            {scenes.length === 0
              ? "This project has no scenes yet — upload a script first."
              : `Reads all ${scenes.length} scenes in one request. ${
                  useStore.getState().production.plannedPagesPerDay
                    ? `Packing to ${useStore.getState().production.plannedPagesPerDay} pages/day.`
                    : "No pages-per-day target is set on this production, so the draft will aim for balanced days."
                } You review the board before any day is created.`}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** The slices the schedule draft reads. */
function useScheduleData(): ProductionData {
  const production = useStore((s) => s.production);
  const scenes = useStore((s) => s.scenes);
  const shootDays = useStore((s) => s.shootDays);
  const locations = useStore((s) => s.locations);
  return useMemo(
    () => ({ production, scenes, shootDays, locations } as unknown as ProductionData),
    [production, scenes, shootDays, locations]
  );
}

function SceneStrip({ scene }: { scene: Scene }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: scene.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const bgColor =
    scene.intExt === "EXT"
      ? "rgba(245,158,11,0.08)"
      : scene.intExt === "INT/EXT"
      ? "rgba(139,92,246,0.08)"
      : "rgba(79,123,247,0.06)";

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, background: bgColor }}
      className="rounded-lg p-2 border border-[var(--border-default)] cursor-grab active:cursor-grabbing group"
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center gap-1.5">
        <GripVertical size={10} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100" />
        <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
          {scene.number}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">{scene.intExt}</span>
        {scene.timeOfDay === "NIGHT" && <Moon size={8} className="text-[var(--color-ai)]" />}
        {scene.timeOfDay === "DAY" && <Sun size={8} className="text-[var(--color-warning)]" />}
      </div>
      <div className="text-[10px] text-[var(--text-secondary)] truncate mt-0.5">
        {scene.location}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-[var(--text-muted)]">{scene.pages}pg</span>
        <div className="flex -space-x-1">
          {scene.elements
            .filter((e) => e.category === "cast")
            .slice(0, 3)
            .map((e, i) => (
              <div
                key={i}
                className="w-4 h-4 rounded-full flex items-center justify-center text-[6px] font-semibold border border-[var(--bg-surface)]"
                style={{
                  background: "var(--accent-blue)",
                  color: "white",
                }}
                title={e.name}
              >
                {e.name[0]}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DOOD CHART
// ============================================================

const DOOD_STATUS_CONFIG: Record<DoodStatus, { label: string; bg: string; fg: string }> = {
  W: { label: "Work", bg: "var(--accent-blue)", fg: "white" },
  H: { label: "Hold", bg: "var(--color-warning)", fg: "white" },
  SW: { label: "Start", bg: "#22C55E", fg: "white" },
  WF: { label: "Finish", bg: "#14B8A6", fg: "white" },
  SWF: { label: "S/F", bg: "#EC4899", fg: "white" },
  T: { label: "Travel", bg: "var(--color-ai)", fg: "white" },
  OFF: { label: "", bg: "transparent", fg: "var(--text-muted)" },
};

function DOODChart() {
  const cast = useStore((s) => s.cast);
  const dood = useStore((s) => s.dood);
  const shootDays = useStore((s) => s.shootDays);
  const setDoodStatus = useStore((s) => s.setDoodStatus);
  const seedDood = useStore((s) => s.seedDoodFromSchedule);
  const activeRole = useStore((s) => s.activeRole);
  const canEdit = activeRole === "admin" || activeRole === "scheduler" || activeRole === "cast";

  // Cast carry their scene ids from the breakdown, and shoot days carry
  // theirs — so the first draft of this grid is already implied by the
  // schedule and needs no AI call to derive.
  const seedable = cast.some((c) => c.scenes.length > 0);
  const runSeed = () => {
    const filled = seedDood();
    if (filled === 0) {
      alert(
        "Nothing to seed. Every cell is already set, or no cast member's scenes appear on a shoot day."
      );
    }
  };

  if (cast.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Day Out Of Days"
          subtitle="Add cast members on the Cast page to start scheduling."
        />
        <div className="text-sm text-[var(--text-muted)]">No cast yet.</div>
      </Card>
    );
  }
  if (shootDays.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Day Out Of Days"
          subtitle="Publish a shooting schedule (Strip Board tab) before building the DOOD."
        />
        <div className="text-sm text-[var(--text-muted)]">No shoot days yet.</div>
      </Card>
    );
  }

  return (
    <Card padding="none">
      <div className="p-4">
        <CardHeader
          title="Day Out Of Days"
          subtitle={
            canEdit
              ? "Pick a status from the dropdown for each cast × day cell. All changes are logged."
              : "Read-only view. Admin, scheduler, and cast coordinator roles can edit."
          }
          right={
            canEdit && seedable ? (
              <Button variant="secondary" size="sm" onClick={runSeed}>
                <Wand2 size={14} /> Seed from schedule
              </Button>
            ) : undefined
          }
        />
        {canEdit && seedable && (
          <div className="text-[11px] text-[var(--text-muted)] -mt-1">
            Fills blank cells from each cast member's scenes — W on their days, H in between. Your
            existing entries are never overwritten.
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="pos-table text-[11px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-[var(--bg-surface)] z-10 min-w-[140px]">Cast</th>
              {shootDays.map((d) => (
                <th key={d.id} className="text-center min-w-[42px] px-1">
                  {d.dayNumber}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cast.map((c) => (
              <tr key={c.id}>
                <td className="sticky left-0 bg-[var(--bg-surface)] z-10 font-medium">
                  <div className="truncate max-w-[130px]">{c.name}</div>
                  <div className="text-[9px] text-[var(--text-muted)] truncate">{c.role}</div>
                </td>
                {shootDays.map((d) => {
                  const status = (dood[c.id]?.[d.dayNumber] ?? "OFF") as DoodStatus;
                  const cfg = DOOD_STATUS_CONFIG[status];
                  return (
                    <td key={d.id} className="text-center px-1 py-1">
                      {canEdit ? (
                        <select
                          value={status}
                          onChange={(e) =>
                            setDoodStatus(c.id, d.dayNumber, e.target.value as DoodStatus)
                          }
                          className="h-6 min-w-[40px] text-[9px] font-semibold rounded px-1 border-0 text-center appearance-none cursor-pointer"
                          style={{
                            background: status === "OFF" ? "transparent" : cfg.bg,
                            color: status === "OFF" ? "var(--text-muted)" : cfg.fg,
                          }}
                          aria-label={`${c.name} · Day ${d.dayNumber}`}
                        >
                          <option value="OFF">·</option>
                          <option value="W">W</option>
                          <option value="H">H</option>
                          <option value="SW">SW</option>
                          <option value="WF">WF</option>
                          <option value="SWF">SWF</option>
                          <option value="T">T</option>
                        </select>
                      ) : status !== "OFF" ? (
                        <span
                          className="inline-block w-6 h-5 rounded text-[9px] font-semibold leading-5 text-center"
                          style={{ background: cfg.bg, color: cfg.fg }}
                        >
                          {cfg.label}
                        </span>
                      ) : (
                        <span className="inline-block w-6 h-5 text-[var(--text-muted)]">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Legend */}
      <div className="p-4 border-t border-[var(--border-default)] flex flex-wrap gap-3">
        {(Object.entries(DOOD_STATUS_CONFIG) as [DoodStatus, typeof DOOD_STATUS_CONFIG[DoodStatus]][])
          .filter(([k]) => k !== "OFF")
          .map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]">
              <span
                className="w-4 h-3 rounded inline-block"
                style={{ background: v.bg }}
              />
              <span className="font-mono">{k}</span> {v.label}
            </span>
          ))}
      </div>
    </Card>
  );
}
