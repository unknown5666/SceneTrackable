import React, { useState, useMemo } from "react";
import { Clock, Lock, Unlock, AlertCircle, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useStore } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { cn, formatCurrency } from "@/lib/utils";
import type { DepartmentId } from "@/types";

export function Timesheet() {
  const activeRole = useStore((s) => s.activeRole);
  const currentUserId = useStore((s) => s.currentUserId);
  const crew = useStore((s) => s.crew);
  const timesheet = useStore((s) => s.timesheet);
  const editHours = useStore((s) => s.editTimesheetHours);
  const submitForCrew = useStore((s) => s.submitTimesheetForCrew);

  const isAdmin = activeRole === "admin";

  // Week selection
  const [weekOffset, setWeekOffset] = useState(0);

  // Get unique dates in timesheet, sorted
  const allDates = useMemo(() => {
    const dates = [...new Set(timesheet.map((t) => t.date))].sort();
    return dates;
  }, [timesheet]);

  // Group dates into weeks (7 day chunks)
  const weeks = useMemo(() => {
    if (allDates.length === 0) return [];
    const ws: string[][] = [];
    let week: string[] = [];
    for (const d of allDates) {
      week.push(d);
      if (week.length === 6) {
        ws.push(week);
        week = [];
      }
    }
    if (week.length) ws.push(week);
    return ws;
  }, [allDates]);

  const currentWeekIdx = Math.max(0, Math.min(weeks.length - 1, weeks.length - 1 + weekOffset));
  const weekDates = weeks[currentWeekIdx] ?? [];

  // Filter crew — admin sees all, others see only self
  const visibleCrew = isAdmin
    ? crew
    : crew.filter((c) => c.id === currentUserId);

  // Group by department
  const departments = useMemo(() => {
    const deps = new Map<DepartmentId, typeof visibleCrew>();
    for (const c of visibleCrew) {
      const arr = deps.get(c.department) ?? [];
      arr.push(c);
      deps.set(c.department, arr);
    }
    return Array.from(deps.entries());
  }, [visibleCrew]);

  // OT rules
  const dailyOT = 10;
  const weeklyOT = 50;

  // Compute totals
  const weekEntries = timesheet.filter((t) => weekDates.includes(t.date));
  const totalHours = weekEntries.reduce((s, e) => s + e.hours, 0);
  const otHours = weekEntries.reduce(
    (s, e) => s + Math.max(0, e.hours - dailyOT),
    0
  );

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="section-header">Timesheet</div>
          <div className="page-title mt-1">
            {isAdmin ? "All Crew Hours" : "My Hours"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset((v) => v - 1)} disabled={currentWeekIdx <= 0}>
            <ChevronLeft size={14} />
          </Button>
          <span className="text-sm text-[var(--text-secondary)]">
            {weekDates[0]} — {weekDates[weekDates.length - 1]}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset((v) => v + 1)} disabled={currentWeekIdx >= weeks.length - 1}>
            <ChevronRight size={14} />
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
          hint={`Daily OT after ${dailyOT}h, weekly after ${weeklyOT}h`}
        />
        <StatCard icon={<Check size={20} />} label="Submitted" value={weekEntries.filter((e) => e.submitted).length} />
        <StatCard icon={<Clock size={20} />} label="Pending" value={weekEntries.filter((e) => !e.submitted).length} tone={weekEntries.some((e) => !e.submitted) ? "warning" : "success"} />
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="pos-table text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 bg-[var(--bg-surface)] z-10 min-w-[180px]">Crew</th>
                {weekDates.map((d) => {
                  const dayName = new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
                  return (
                    <th key={d} className="text-center min-w-[80px]">
                      <div>{dayName}</div>
                      <div className="text-[10px] text-[var(--text-muted)] font-normal">{d.slice(5)}</div>
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
                      (s, e) => s + Math.max(0, e.hours - dailyOT),
                      0
                    );
                    const allSubmitted = memberEntries.every((e) => e.submitted);
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
                              <td key={date} className="text-center text-[var(--text-muted)]">
                                —
                              </td>
                            );
                          }
                          const isOT = entry.hours > dailyOT;
                          const isDT = entry.hours > 14;
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
                                    isAdminEdited && "bg-[rgba(245,158,11,0.1)] border-[var(--color-warning)]"
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
                            <Badge tone="success" dot><Lock size={8} /> Submitted</Badge>
                          ) : canEdit && member.id === currentUserId ? (
                            <Button size="sm" variant="secondary" onClick={() => submitForCrew(member.id)}>
                              Submit
                            </Button>
                          ) : (
                            <Badge tone="muted" dot><Unlock size={8} /> Draft</Badge>
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
    </div>
  );
}
