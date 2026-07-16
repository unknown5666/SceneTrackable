import React, { useState, useMemo } from "react";
import { Clock, Lock, Unlock, AlertCircle, Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useStore, isCurrentAdmin } from "@/state/store";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { cn } from "@/lib/utils";
import type { DepartmentId, CrewMember } from "@/types";

const DAILY_OT = 10;
const DAILY_DT = 14;
const WEEKLY_OT = 50;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekOfISO(base: string): string[] {
  const d = new Date(base + "T00:00:00");
  // Monday-start week
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(day.getDate() + i);
    return day.toISOString().slice(0, 10);
  });
}

export function Timesheet() {
  const currentUserId = useStore((s) => s.currentUserId);
  const isAdmin = useStore(isCurrentAdmin);
  const crew = useStore((s) => s.crew);
  const timesheet = useStore((s) => s.timesheet);
  const editHours = useStore((s) => s.editTimesheetHours);
  const addEntry = useStore((s) => s.addTimesheetEntry);
  const submitForCrew = useStore((s) => s.submitTimesheetForCrew);

  const [anchorDate, setAnchorDate] = useState<string>(todayISO());
  const weekDates = useMemo(() => weekOfISO(anchorDate), [anchorDate]);

  const [addOpen, setAddOpen] = useState(false);

  const visibleCrew = isAdmin ? crew : crew.filter((c) => c.id === currentUserId);

  const departments = useMemo(() => {
    const deps = new Map<DepartmentId, CrewMember[]>();
    for (const c of visibleCrew) {
      const arr = deps.get(c.department) ?? [];
      arr.push(c);
      deps.set(c.department, arr);
    }
    return Array.from(deps.entries());
  }, [visibleCrew]);

  const weekEntries = timesheet.filter((t) => weekDates.includes(t.date));
  const totalHours = weekEntries.reduce((s, e) => s + e.hours, 0);
  const otHours = weekEntries.reduce((s, e) => s + Math.max(0, e.hours - DAILY_OT), 0);

  const shiftWeek = (delta: number) => {
    const d = new Date(anchorDate + "T00:00:00");
    d.setDate(d.getDate() + delta * 7);
    setAnchorDate(d.toISOString().slice(0, 10));
  };

  if (crew.length === 0) {
    return (
      <div className="max-w-[1400px] mx-auto">
        <div className="mb-6">
          <div className="section-header">Timesheet</div>
          <div className="page-title mt-1">{isAdmin ? "All Crew Hours" : "My Hours"}</div>
        </div>
        <EmptyState
          title="No crew on this project"
          subtitle={
            isAdmin
              ? "Add crew members from the Camera / Art / VFX portals or via the Admin console before logging hours."
              : "Ask a producer to add you to the crew before you can log hours."
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="section-header">Timesheet</div>
          <div className="page-title mt-1">{isAdmin ? "All Crew Hours" : "My Hours"}</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">
            OT after {DAILY_OT}h / day · Double time after {DAILY_DT}h · Weekly OT after {WEEKLY_OT}h
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => shiftWeek(-1)}>
            <ChevronLeft size={14} />
          </Button>
          <span className="text-sm text-[var(--text-secondary)] tabular-nums">
            {weekDates[0]} — {weekDates[6]}
          </span>
          <Button variant="ghost" size="sm" onClick={() => shiftWeek(1)}>
            <ChevronRight size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAnchorDate(todayISO())}>
            Today
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Add day
          </Button>
        </div>
      </div>

      {/* Weekly summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={<Clock size={20} />} label="Total Hours" value={totalHours.toFixed(1)} />
        <StatCard
          icon={<AlertCircle size={20} />}
          label="Overtime Hours"
          value={otHours.toFixed(1)}
          tone={otHours > 0 ? "warning" : "neutral"}
        />
        <StatCard
          icon={<Check size={20} />}
          label="Submitted"
          value={weekEntries.filter((e) => e.submitted).length}
        />
        <StatCard
          icon={<Clock size={20} />}
          label="Pending"
          value={weekEntries.filter((e) => !e.submitted).length}
          tone={weekEntries.some((e) => !e.submitted) ? "warning" : "success"}
        />
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="pos-table text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 bg-[var(--bg-surface)] z-10 min-w-[180px]">Crew</th>
                {weekDates.map((d) => {
                  const dayName = new Date(d + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "short",
                  });
                  const isToday = d === todayISO();
                  return (
                    <th
                      key={d}
                      className={cn(
                        "text-center min-w-[80px]",
                        isToday && "text-[var(--accent-blue)]"
                      )}
                    >
                      <div>{dayName}</div>
                      <div className="text-[10px] text-[var(--text-muted)] font-normal">
                        {d.slice(5)}
                      </div>
                    </th>
                  );
                })}
                <th className="text-center min-w-[70px]">Total</th>
                <th className="text-center min-w-[50px]">OT</th>
                <th className="min-w-[90px]">Status</th>
              </tr>
            </thead>
            <tbody>
              {departments.map(([dept, members]) => (
                <React.Fragment key={dept}>
                  <tr>
                    <td
                      colSpan={weekDates.length + 4}
                      className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] py-2"
                      style={{ background: "var(--bg-surface-hover)" }}
                    >
                      {dept}
                    </td>
                  </tr>
                  {members.map((member) => {
                    const memberEntries = timesheet.filter(
                      (e) => e.crewMemberId === member.id && weekDates.includes(e.date)
                    );
                    const weekTotal = memberEntries.reduce((s, e) => s + e.hours, 0);
                    const weekOT = memberEntries.reduce(
                      (s, e) => s + Math.max(0, e.hours - DAILY_OT),
                      0
                    );
                    const allSubmitted =
                      memberEntries.length > 0 && memberEntries.every((e) => e.submitted);
                    const canEdit = isAdmin || member.id === currentUserId;

                    return (
                      <tr key={member.id}>
                        <td className="sticky left-0 bg-[var(--bg-surface)] z-10">
                          <div className="text-sm font-medium text-[var(--text-primary)]">
                            {member.name}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">{member.role}</div>
                        </td>
                        {weekDates.map((date) => {
                          const entry = memberEntries.find((e) => e.date === date);
                          if (!entry) {
                            return (
                              <td key={date} className="text-center">
                                {canEdit ? (
                                  <button
                                    className="text-[var(--text-muted)] hover:text-[var(--accent-blue)] text-xs"
                                    onClick={() =>
                                      addEntry({
                                        crewMemberId: member.id,
                                        date,
                                        hours: 0,
                                      })
                                    }
                                    title="Add day"
                                  >
                                    +
                                  </button>
                                ) : (
                                  <span className="text-[var(--text-muted)]">—</span>
                                )}
                              </td>
                            );
                          }
                          const isOT = entry.hours > DAILY_OT;
                          const isDT = entry.hours > DAILY_DT;
                          const isAdminEdited = entry.edits.some((ed) => ed.isAdminOverride);
                          return (
                            <td key={date} className="text-center">
                              {canEdit && (!entry.submitted || isAdmin) ? (
                                <input
                                  type="number"
                                  value={entry.hours}
                                  onChange={(e) => {
                                    const v = parseFloat(e.target.value);
                                    if (!isNaN(v) && v >= 0 && v <= 24) {
                                      editHours(entry.id, v, currentUserId, isAdmin);
                                    }
                                  }}
                                  step="0.5"
                                  min="0"
                                  max="24"
                                  className={cn(
                                    "w-14 h-7 text-center text-xs rounded",
                                    isDT
                                      ? "text-[var(--color-danger)] font-semibold"
                                      : isOT
                                      ? "text-[var(--color-warning)] font-semibold"
                                      : "text-[var(--text-primary)]",
                                    isAdminEdited &&
                                      "bg-[rgba(245,158,11,0.1)] border-[var(--color-warning)]"
                                  )}
                                />
                              ) : (
                                <span
                                  className={cn(
                                    "text-xs",
                                    isDT
                                      ? "text-[var(--color-danger)] font-semibold"
                                      : isOT
                                      ? "text-[var(--color-warning)] font-semibold"
                                      : "text-[var(--text-primary)]"
                                  )}
                                >
                                  {entry.hours}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="text-center font-medium text-[var(--text-primary)]">
                          {weekTotal.toFixed(1)}
                        </td>
                        <td className="text-center">
                          {weekOT > 0 ? (
                            <span className="text-[var(--color-warning)] font-medium text-xs">
                              {weekOT.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)]">0</span>
                          )}
                        </td>
                        <td>
                          {allSubmitted ? (
                            <Badge tone="success" dot>
                              <Lock size={8} /> Submitted
                            </Badge>
                          ) : canEdit && (member.id === currentUserId || isAdmin) ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => submitForCrew(member.id)}
                              disabled={memberEntries.length === 0}
                            >
                              Submit
                            </Button>
                          ) : (
                            <Badge tone="muted" dot>
                              <Unlock size={8} /> Draft
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AddDayModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        crew={visibleCrew}
        me={currentUserId}
        isAdmin={isAdmin}
      />
    </div>
  );
}

function AddDayModal({
  open,
  onClose,
  crew,
  me,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  crew: CrewMember[];
  me: string;
  isAdmin: boolean;
}) {
  const addEntry = useStore((s) => s.addTimesheetEntry);
  const [target, setTarget] = useState<string>(me);
  const [date, setDate] = useState<string>(todayISO());
  const [hours, setHours] = useState<string>("8");

  React.useEffect(() => {
    if (!open) return;
    setTarget(isAdmin ? me : me);
    setDate(todayISO());
    setHours("8");
  }, [open, me, isAdmin]);

  const submit = () => {
    const h = parseFloat(hours);
    if (isNaN(h) || h < 0 || h > 24) return;
    addEntry({ crewMemberId: target, date, hours: h });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a day"
      subtitle="Adds a fresh timesheet entry. If one already exists for this crew+date, nothing changes."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!target || !date}>Add</Button>
        </>
      }
    >
      <div className="space-y-4">
        {isAdmin && (
          <div>
            <label className="section-header block mb-1.5">Crew member</label>
            <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full">
              {crew.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.role}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="section-header block mb-1.5">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full"
            />
          </div>
          <div>
            <label className="section-header block mb-1.5">Hours</label>
            <input
              type="number"
              min="0"
              max="24"
              step="0.5"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="w-full"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
