import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Calendar,
  DollarSign,
  AlertCircle,
  Sparkles,
  Camera,
  Radio,
  Palette,
  Users,
  Film,
  Check,
  X,
  RefreshCw,
} from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  BarChart,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { useStore, activeProject, currentRole } from "@/state/store";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { formatCurrency, formatCompact, formatDate, isOverdue } from "@/lib/utils";
import { callClaude } from "@/lib/claude";
import { FolderKanban, Upload } from "lucide-react";
import type { RoleId, DepartmentId } from "@/types";

export function Dashboard() {
  const nav = useNavigate();
  const role = useStore(currentRole);
  const activeRole = (role?.access.includes("all") ? "admin" : role?.id) ?? "admin";
  const project = useStore(activeProject);
  const sceneCount = useStore((s) => s.scenes.length);

  if (!project) {
    return (
      <div className="max-w-[1000px] mx-auto">
        <div className="mb-6">
          <div className="section-header">Dashboard</div>
          <div className="page-title mt-1">Welcome to SceneTrackable</div>
        </div>
        <Card padding="lg">
          <EmptyState
            icon={<FolderKanban size={48} />}
            title="No project selected"
            subtitle="Create a production and upload its script to see your dashboard come alive with schedule, budget and breakdown insights."
            cta={<Button onClick={() => nav("/projects")}><FolderKanban size={14} /> Go to Projects</Button>}
          />
        </Card>
      </div>
    );
  }

  if (sceneCount === 0) {
    return (
      <div className="max-w-[1000px] mx-auto">
        <div className="mb-6">
          <div className="section-header">Dashboard · {project.name}</div>
          <div className="page-title mt-1">Ready when you are</div>
        </div>
        <Card padding="lg">
          <EmptyState
            icon={<Upload size={48} />}
            title="Upload a script to begin"
            subtitle="Once you upload a screenplay, SceneTrackable builds the breakdown and this dashboard fills with production data."
            cta={<Button onClick={() => nav("/projects")}><Upload size={14} /> Upload script</Button>}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <PageHeader role={activeRole} />
      {activeRole === "admin" ? (
        <AdminDashboard />
      ) : activeRole === "accountant" ? (
        <AccountantDashboard />
      ) : activeRole === "vfx" ? (
        <VFXDashboard />
      ) : activeRole === "camera" ? (
        <CameraDashboard />
      ) : activeRole === "rf_comms" ? (
        <RFDashboard />
      ) : activeRole === "art" ? (
        <ArtDashboard />
      ) : activeRole === "cast" ? (
        <CastDashboard />
      ) : (
        <SchedulerDashboard />
      )}
    </div>
  );
}

function PageHeader({ role }: { role: RoleId }) {
  const label = role
    .replace("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
  return (
    <div>
      <div className="section-header">Dashboard</div>
      <div className="page-title mt-1">Good day, {label}.</div>
    </div>
  );
}

// ============================================================
// ADMIN DASHBOARD
// ============================================================

function AdminDashboard() {
  const nav = useNavigate();
  const production = useStore((s) => s.production);
  const shootDays = useStore((s) => s.shootDays);
  const tasks = useStore((s) => s.tasks);
  const purchaseOrders = useStore((s) => s.purchaseOrders);
  const budgetLines = useStore((s) => s.budgetLines);
  const crew = useStore((s) => s.crew);
  const scenes = useStore((s) => s.scenes);
  const vfxShots = useStore((s) => s.vfxShots);

  const advancePO = useStore((s) => s.advancePO);
  const currentUserId = useStore((s) => s.currentUserId);

  // ------- KPIs -------
  const daysShot = production.currentShootDay;
  const totalDays = production.totalShootDays;
  const scheduleProgress = daysShot / totalDays;

  const totalBudgeted = budgetLines.reduce((s, l) => s + l.budgeted, 0);
  const totalSpent = budgetLines.reduce((s, l) => s + l.spent, 0);
  const totalCommitted = budgetLines.reduce((s, l) => s + l.committed, 0);
  const budgetBurn = totalSpent / totalBudgeted;

  const overdueTasks = tasks.filter(
    (t) => t.status !== "completed" && isOverdue(t.computedDeadline)
  );
  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const taskCompletion = tasks.length > 0 ? completedTasks / tasks.length : 0;

  // Composite health score
  const scheduleAdh = 91 / 100;
  const budgetVar = 1 - Math.abs(budgetBurn - scheduleProgress) * 2;
  const health = Math.round(
    (scheduleAdh * 0.4 + Math.max(0, budgetVar) * 0.3 + taskCompletion * 0.3) * 100
  );

  const healthTone: "success" | "warning" | "danger" =
    health >= 80 ? "success" : health >= 60 ? "warning" : "danger";

  const burnTone: "success" | "warning" | "danger" =
    budgetBurn < scheduleProgress - 0.05
      ? "success"
      : budgetBurn > scheduleProgress + 0.05
      ? "danger"
      : "warning";

  // ------- Schedule chart data -------
  const scheduleChart = useMemo(() => {
    const targetPPD = production.plannedPagesPerDay;
    const actualBase = 1.2;
    let cumulPlanned = 0;
    let cumulActual = 0;
    return shootDays.map((d, i) => {
      const dayNum = d.dayNumber;
      const planned = targetPPD + (i % 5 === 0 ? 0.2 : 0);
      const actual = dayNum <= daysShot ? actualBase + ((i * 0.11) % 0.6) : 0;
      const projected = dayNum > daysShot ? actualBase + 0.05 : 0;
      cumulPlanned += planned;
      if (dayNum <= daysShot) cumulActual += actual;
      return {
        day: dayNum,
        planned: parseFloat(planned.toFixed(2)),
        actual: parseFloat(actual.toFixed(2)),
        projected: parseFloat(projected.toFixed(2)),
        cumulPlanned: parseFloat(cumulPlanned.toFixed(1)),
        cumulActual:
          dayNum <= daysShot ? parseFloat(cumulActual.toFixed(1)) : undefined,
      };
    });
  }, [shootDays, daysShot, production.plannedPagesPerDay]);

  // ------- Dept health rows -------
  const deptHealth = useMemo(() => {
    const deps: DepartmentId[] = ["camera", "sound", "vfx", "art", "wardrobe", "props", "accounting", "transport"];
    return deps.map((dep) => {
      const deptTasks = tasks.filter((t) => t.department === dep);
      const done = deptTasks.filter((t) => t.status === "completed").length;
      const overdue = deptTasks.filter(
        (t) => t.status !== "completed" && isOverdue(t.computedDeadline)
      ).length;
      const deptBudget = budgetLines.filter((b) => b.department === dep);
      const budgeted = deptBudget.reduce((s, l) => s + l.budgeted, 0);
      const spent = deptBudget.reduce((s, l) => s + l.spent, 0);
      const spentPct = budgeted > 0 ? spent / budgeted : 0;
      const status: "on_track" | "at_risk" | "critical" =
        overdue >= 3 || spentPct > 0.9
          ? "critical"
          : overdue > 0 || spentPct > 0.75
          ? "at_risk"
          : "on_track";
      return {
        dep,
        done,
        total: deptTasks.length,
        overdue,
        budgeted,
        spent,
        spentPct,
        status,
      };
    });
  }, [tasks, budgetLines]);

  // ------- Approvals queue -------
  const pendingPOs = purchaseOrders.filter(
    (p) => p.status === "submitted" || p.status === "accountant_review" || p.status === "admin_approval"
  );

  // ------- Radar -------
  const radarData = [
    { axis: "Pages/Day", planned: 100, actual: 86 },
    { axis: "Scene Completion", planned: 100, actual: 88 },
    { axis: "Budget Adherence", planned: 100, actual: 93 },
    { axis: "Task Completion", planned: 100, actual: Math.round(taskCompletion * 100) },
    { axis: "VFX Delivery", planned: 100, actual: 74 },
    { axis: "Equipment Readiness", planned: 100, actual: 95 },
  ];

  // ------- AI Digest -------
  const [digest, setDigest] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestTokens, setDigestTokens] = useState<{ in: number; out: number; mock: boolean } | null>(null);
  const recordAIUsage = useStore((s) => s.recordAIUsage);

  const runDigest = async () => {
    setDigestLoading(true);
    try {
      const res = await callClaude({
        feature: "daily_digest",
        system: "You are a production analyst. Given the current state, produce 3-5 concise bullet insights about production health for the Production Manager. Use actual numbers.",
        user: `Production: ${production.title}, Day ${daysShot}/${totalDays}. Schedule adherence 91%. Budget burn ${Math.round(budgetBurn * 100)}% vs ${Math.round(scheduleProgress * 100)}% schedule. Overdue tasks: ${overdueTasks.length}. Pending POs: ${pendingPOs.length}.`,
        maxTokens: 400,
      });
      setDigest(res.text);
      setDigestTokens({ in: res.inputTokens, out: res.outputTokens, mock: res.fromMock });
      recordAIUsage({
        feature: "daily_digest",
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        model: res.model,
        costUsd: res.costUsd,
      });
    } finally {
      setDigestLoading(false);
    }
  };

  return (
    <>
      {/* Row 1 — KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Activity size={20} />}
          label="Production Health"
          value={`${health}`}
          hint="Composite score / 100"
          tone={healthTone}
          trend={{ direction: "flat", label: "Steady vs last week", upIsGood: true }}
          sparklineData={[72, 75, 74, 78, 76, 79, health].map((v) => ({ v }))}
        />
        <StatCard
          icon={<Calendar size={20} />}
          label="Days Shot"
          value={`${daysShot} / ${totalDays}`}
          hint={`${Math.round(scheduleProgress * 100)}% of schedule`}
          trend={{ direction: "down", label: "~0.2 pages/day behind", upIsGood: true }}
        />
        <StatCard
          icon={<DollarSign size={20} />}
          label="Budget Burn"
          value={`${Math.round(budgetBurn * 100)}%`}
          hint={`Spent vs ${Math.round(scheduleProgress * 100)}% schedule`}
          tone={burnTone}
          trend={{ direction: "up", label: `${formatCurrency(totalSpent, production.currency)} spent`, upIsGood: false }}
        />
        <StatCard
          icon={<AlertCircle size={20} />}
          label="Overdue Tasks"
          value={overdueTasks.length}
          hint={overdueTasks.length > 0 ? "Attention required" : "All on track"}
          tone={overdueTasks.length > 0 ? "danger" : "success"}
        />
      </div>

      {/* Row 2 — Schedule chart */}
      <Card>
        <CardHeader
          title="Shooting Pace"
          subtitle="Pages planned vs actual per day, cumulative page count overlay"
          right={
            <div className="flex items-center gap-3 text-xs">
              <LegendDot color="rgba(79,123,247,0.35)" label="Planned" />
              <LegendDot color="var(--accent-blue)" label="Actual" />
              <LegendDot color="var(--color-warning)" label="Projected" square />
              <LegendDot color="var(--color-success)" line label="Cumulative" />
            </div>
          }
        />
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={scheduleChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="day"
                stroke="var(--text-muted)"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "var(--border-default)" }}
              />
              <YAxis
                yAxisId="pages"
                stroke="var(--text-muted)"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "var(--border-default)" }}
              />
              <YAxis
                yAxisId="cumul"
                orientation="right"
                stroke="var(--text-muted)"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "var(--border-default)" }}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--tooltip-bg)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 8,
                }}
                labelStyle={{ color: "var(--text-primary)" }}
              />
              <Bar yAxisId="pages" dataKey="planned" fill="rgba(79,123,247,0.35)" radius={[2, 2, 0, 0]} />
              <Bar yAxisId="pages" dataKey="actual" fill="var(--accent-blue)" radius={[2, 2, 0, 0]} />
              <Bar yAxisId="pages" dataKey="projected" fill="transparent" stroke="var(--color-warning)" strokeDasharray="3 3" />
              <Line
                yAxisId="cumul"
                type="monotone"
                dataKey="cumulPlanned"
                stroke="rgba(34,197,94,0.4)"
                strokeDasharray="4 4"
                dot={false}
                strokeWidth={2}
              />
              <Line
                yAxisId="cumul"
                type="monotone"
                dataKey="cumulActual"
                stroke="var(--color-success)"
                dot={false}
                strokeWidth={2}
                connectNulls={false}
              />
              <ReferenceLine
                yAxisId="pages"
                x={daysShot}
                stroke="var(--text-secondary)"
                strokeDasharray="2 2"
                label={{
                  value: "Today",
                  fill: "var(--text-secondary)",
                  fontSize: 10,
                  position: "top",
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Row 3 — Dept table + Approvals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2" padding="none">
          <div className="p-4">
            <CardHeader
              title="Department Health"
              subtitle="Click a row to open that department's portal"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="pos-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th className="text-right">Tasks</th>
                  <th className="text-right">Overdue</th>
                  <th className="text-right">Budget Used</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {deptHealth.map((row) => (
                  <tr
                    key={row.dep}
                    className="cursor-pointer"
                    onClick={() => nav(deptRoute(row.dep))}
                  >
                    <td>
                      <div className="flex items-center gap-2">
                        <DeptIcon d={row.dep} />
                        <span className="capitalize">{row.dep}</span>
                      </div>
                    </td>
                    <td className="text-right text-[var(--text-secondary)]">
                      {row.done} / {row.total}
                    </td>
                    <td className="text-right">
                      {row.overdue > 0 ? (
                        <span className="text-[var(--color-danger)] font-medium">
                          {row.overdue}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">0</span>
                      )}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-20">
                          <ProgressBar
                            value={row.spentPct * 100}
                            tone={
                              row.spentPct > 0.9 ? "danger" : row.spentPct > 0.75 ? "warning" : "success"
                            }
                            height={4}
                          />
                        </div>
                        <div className="text-xs text-[var(--text-muted)] w-10 text-right">
                          {Math.round(row.spentPct * 100)}%
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge
                        tone={
                          row.status === "on_track"
                            ? "success"
                            : row.status === "at_risk"
                            ? "warning"
                            : "danger"
                        }
                        dot
                      >
                        {row.status === "on_track"
                          ? "On track"
                          : row.status === "at_risk"
                          ? "At risk"
                          : "Critical"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Approvals */}
        <Card>
          <CardHeader
            title="Approvals Queue"
            subtitle={`${pendingPOs.length} pending`}
          />
          {pendingPOs.length === 0 ? (
            <EmptyState
              icon={<Check size={40} />}
              title="Nothing waiting"
              subtitle="You're all caught up on approvals."
            />
          ) : (
            <div className="space-y-2">
              {pendingPOs.slice(0, 4).map((po) => {
                const requester = crew.find((c) => c.id === po.requestedBy);
                return (
                  <div
                    key={po.id}
                    className="p-3 rounded-lg border border-[var(--border-default)]"
                    style={{ background: "var(--bg-elevated)" }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="text-xs text-[var(--text-secondary)]">
                          {po.number} · {po.vendor}
                        </div>
                        <div className="text-sm font-medium text-[var(--text-primary)] mt-0.5 truncate">
                          {po.description}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-[var(--text-primary)] shrink-0">
                        {formatCurrency(po.amount, po.currency)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {requester?.name} · {formatDate(po.requestedAt)}
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => advancePO(po.id, "reject", currentUserId)}
                        >
                          <X size={12} />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => advancePO(po.id, "approve", currentUserId)}
                        >
                          <Check size={12} /> Approve
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Row 4 — Radar + AI insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader
            title="Schedule Adherence"
            subtitle="Planned vs actual across production dimensions"
          />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--chart-grid)" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                  axisLine={false}
                />
                <Radar
                  name="Planned"
                  dataKey="planned"
                  stroke="rgba(79,123,247,0.4)"
                  fill="transparent"
                  strokeDasharray="4 4"
                />
                <Radar
                  name="Actual"
                  dataKey="actual"
                  stroke="var(--accent-blue)"
                  fill="rgba(79,123,247,0.2)"
                  strokeWidth={2}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--tooltip-bg)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 8,
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card variant="ai">
          <CardHeader
            title={
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-[var(--color-ai)]" />
                <span>AI Insights</span>
              </div>
            }
            subtitle="Daily digest, generated by Claude"
            right={
              <Button
                variant="ai"
                size="sm"
                onClick={runDigest}
                loading={digestLoading}
              >
                <RefreshCw size={12} /> Regenerate
              </Button>
            }
          />
          {!digest ? (
            <EmptyState
              icon={<Sparkles size={40} />}
              title="No digest yet"
              subtitle="Click Regenerate to summarize today's production state."
            />
          ) : (
            <>
              <div className="whitespace-pre-wrap text-sm text-[var(--text-primary)] leading-relaxed">
                {digest}
              </div>
              {digestTokens && (
                <div className="mt-4 pt-3 border-t border-[var(--border-default)] flex items-center justify-between">
                  <Badge tone="ai">
                    ~{digestTokens.in} in / {digestTokens.out} out
                  </Badge>
                  {digestTokens.mock && (
                    <Badge tone="muted">Mock response</Badge>
                  )}
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}

// ============================================================
// SCHEDULER DASHBOARD
// ============================================================

function SchedulerDashboard() {
  const nav = useNavigate();
  const shootDays = useStore((s) => s.shootDays);
  const scenes = useStore((s) => s.scenes);
  const tasks = useStore((s) => s.tasks);
  const production = useStore((s) => s.production);

  const overdue = tasks.filter(
    (t) => (t.department === "production" || t.department === "cast") &&
      t.status !== "completed" &&
      isOverdue(t.computedDeadline)
  ).length;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Calendar size={20} />} label="Days Shot" value={`${production.currentShootDay} / ${production.totalShootDays}`} />
        <StatCard icon={<Film size={20} />} label="Scenes Left" value={scenes.length - shootDays.slice(0, production.currentShootDay).flatMap((d) => d.scenes).length} />
        <StatCard icon={<AlertCircle size={20} />} label="Overdue" value={overdue} tone={overdue ? "danger" : "success"} />
        <StatCard icon={<Users size={20} />} label="Cast on Hold Today" value={2} />
      </div>

      <Card>
        <CardHeader
          title="Next 7 Shoot Days"
          right={<Button variant="secondary" size="sm" onClick={() => nav("/schedule")}>Open Strip Board</Button>}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-2">
          {shootDays.slice(production.currentShootDay, production.currentShootDay + 7).map((d) => (
            <div
              key={d.id}
              className="p-3 rounded-lg border border-[var(--border-default)]"
              style={{ background: "var(--bg-surface)" }}
            >
              <div className="text-xs text-[var(--text-muted)]">Day {d.dayNumber}</div>
              <div className="text-sm font-medium text-[var(--text-primary)] mt-1">{formatDate(d.date)}</div>
              <div className="text-[10px] text-[var(--text-secondary)] mt-1 line-clamp-2">
                {d.location}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] mt-2">
                {d.scenes.length} scene{d.scenes.length !== 1 ? "s" : ""}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

// ============================================================
// ACCOUNTANT DASHBOARD
// ============================================================

function AccountantDashboard() {
  const nav = useNavigate();
  const purchaseOrders = useStore((s) => s.purchaseOrders);
  const budgetLines = useStore((s) => s.budgetLines);
  const pettyCash = useStore((s) => s.pettyCash);
  const production = useStore((s) => s.production);

  const totalBudgeted = budgetLines.reduce((s, l) => s + l.budgeted, 0);
  const totalSpent = budgetLines.reduce((s, l) => s + l.spent, 0);
  const totalCommitted = budgetLines.reduce((s, l) => s + l.committed, 0);
  const pendingReview = purchaseOrders.filter((p) => p.status === "accountant_review" || p.status === "submitted");
  const pettyBalance = pettyCash.reduce((s, e) => s + e.amount, 0);

  const spendData = useMemo(() => {
    // Weekly buckets
    const weeks = 4;
    return Array.from({ length: weeks }, (_, i) => ({
      week: `W${i + 1}`,
      spent: 40000 + i * 30000 + Math.round(Math.random() * 15000),
      committed: 60000 + i * 25000,
    }));
  }, []);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<DollarSign size={20} />} label="Total Budget" value={formatCurrency(totalBudgeted, production.currency)} />
        <StatCard icon={<DollarSign size={20} />} label="Spent" value={formatCurrency(totalSpent, production.currency)} hint={`${Math.round((totalSpent / totalBudgeted) * 100)}% of budget`} />
        <StatCard icon={<DollarSign size={20} />} label="Committed" value={formatCurrency(totalCommitted - totalSpent, production.currency)} hint="Committed, not yet paid" tone="warning" />
        <StatCard icon={<AlertCircle size={20} />} label="POs Pending" value={pendingReview.length} tone={pendingReview.length > 0 ? "warning" : "success"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Weekly Burn" subtitle="Spend vs committed" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={spendData}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="week" stroke="var(--text-muted)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompact(v)} />
                <Tooltip contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--border-default)", borderRadius: 8 }} />
                <Bar dataKey="spent" stackId="a" fill="var(--accent-blue)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="committed" stackId="a" fill="var(--color-warning)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Petty Cash" subtitle="Running total this week" />
          <div className="data-value text-2xl">{formatCurrency(pettyBalance, production.currency)}</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">{pettyCash.length} entries logged</div>
          <div className="mt-4 space-y-1.5">
            {pettyCash.slice(0, 4).map((e) => (
              <div key={e.id} className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)] truncate mr-2">{e.description}</span>
                <span className="text-[var(--text-primary)] font-medium">{formatCurrency(e.amount, e.currency)}</span>
              </div>
            ))}
          </div>
          <Button variant="secondary" size="sm" className="w-full mt-4" onClick={() => nav("/budget")}>Open budget</Button>
        </Card>
      </div>
    </>
  );
}

// ============================================================
// VFX DASHBOARD
// ============================================================

function VFXDashboard() {
  const nav = useNavigate();
  const vfxShots = useStore((s) => s.vfxShots);
  const vfxVendors = useStore((s) => s.vfxVendors);

  const total = vfxShots.length;
  const inProgress = vfxShots.filter((s) => s.status === "in_progress" || s.status === "awarded").length;
  const delivered = vfxShots.filter((s) => s.status === "delivered").length;
  const overdue = vfxShots.filter(
    (s) => s.finalDueDate && isOverdue(s.finalDueDate) && s.status !== "delivered"
  ).length;

  const pipeline = ["bid", "awarded", "in_progress", "internal_review", "client_review", "final", "delivered"];
  const funnel = pipeline.map((stage) => ({
    stage: stage.replace("_", " "),
    count: vfxShots.filter((s) => s.status === stage).length,
  }));

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Sparkles size={20} />} label="Total Shots" value={total} />
        <StatCard icon={<Activity size={20} />} label="In Progress" value={inProgress} tone="warning" />
        <StatCard icon={<Check size={20} />} label="Delivered" value={delivered} tone="success" />
        <StatCard icon={<AlertCircle size={20} />} label="Overdue" value={overdue} tone={overdue ? "danger" : "success"} />
      </div>

      <Card>
        <CardHeader title="Shot Pipeline" subtitle="Distribution across the pipeline" right={<Button variant="secondary" size="sm" onClick={() => nav("/vfx")}>Open board</Button>} />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnel} layout="vertical">
              <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
              <XAxis type="number" stroke="var(--text-muted)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis dataKey="stage" type="category" stroke="var(--text-muted)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
              <Tooltip contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--border-default)", borderRadius: 8 }} />
              <Bar dataKey="count" fill="var(--color-ai)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardHeader title="Vendors" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {vfxVendors.map((v) => (
            <div
              key={v.id}
              className="p-3 rounded-lg border border-[var(--border-default)]"
              style={{ background: "var(--bg-elevated)" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">{v.name}</div>
                  <div className="text-xs text-[var(--text-muted)]">{v.city} · {v.assignedShots.length} shots</div>
                </div>
                <Badge tone={v.onTimePercent > 90 ? "success" : v.onTimePercent > 80 ? "warning" : "danger"}>
                  {v.onTimePercent}% on-time
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

// ============================================================
// OTHER DEPT DASHBOARDS (compact)
// ============================================================

function CameraDashboard() {
  const nav = useNavigate();
  const cameraKits = useStore((s) => s.cameraKits);
  const equipmentCheckouts = useStore((s) => s.equipmentCheckouts);
  const checklists = useStore((s) => s.checklists);
  const openChecks = checklists.reduce(
    (s, c) => s + c.items.filter((i) => !i.done).length,
    0
  );
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Camera size={20} />} label="Kits" value={cameraKits.length} />
        <StatCard icon={<Check size={20} />} label="Checkouts" value={equipmentCheckouts.length} />
        <StatCard icon={<AlertCircle size={20} />} label="Open Checklist Items" value={openChecks} tone={openChecks > 5 ? "warning" : "neutral"} />
        <StatCard icon={<Calendar size={20} />} label="Next Prep Day" value="Day 15" />
      </div>
      <Card>
        <CardHeader title="Prep Progress" right={<Button variant="secondary" size="sm" onClick={() => nav("/camera")}>Open portal</Button>} />
        <div className="space-y-3">
          {checklists.map((c) => {
            const done = c.items.filter((i) => i.done).length;
            const pct = c.items.length ? (done / c.items.length) * 100 : 0;
            return (
              <div key={c.id}>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-medium text-[var(--text-primary)]">{c.title}</div>
                  <div className="text-xs text-[var(--text-secondary)]">{done} / {c.items.length}</div>
                </div>
                <ProgressBar value={pct} tone={pct > 75 ? "success" : pct > 40 ? "warning" : "danger"} />
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

function RFDashboard() {
  const rfEquipment = useStore((s) => s.rfEquipment);
  const frequencyPlan = useStore((s) => s.frequencyPlan);
  const assigned = rfEquipment.filter((e) => e.status === "assigned").length;
  const maint = rfEquipment.filter((e) => e.status === "maintenance").length;
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Radio size={20} />} label="Devices" value={rfEquipment.length} />
        <StatCard icon={<Activity size={20} />} label="Assigned" value={assigned} />
        <StatCard icon={<AlertCircle size={20} />} label="Maintenance" value={maint} tone={maint ? "warning" : "success"} />
        <StatCard icon={<Calendar size={20} />} label="Frequencies Filed" value={frequencyPlan.length} />
      </div>
    </>
  );
}

function ArtDashboard() {
  const artElements = useStore((s) => s.artElements);
  const needed = artElements.filter((e) => e.status === "needed").length;
  const inProgress = artElements.filter((e) => e.status === "in_progress" || e.status === "fitting").length;
  const ready = artElements.filter((e) => e.status === "ready").length;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard icon={<Palette size={20} />} label="Elements" value={artElements.length} />
      <StatCard icon={<AlertCircle size={20} />} label="Still Needed" value={needed} tone={needed > 0 ? "warning" : "success"} />
      <StatCard icon={<Activity size={20} />} label="In Progress" value={inProgress} />
      <StatCard icon={<Check size={20} />} label="Ready" value={ready} tone="success" />
    </div>
  );
}

function CastDashboard() {
  const cast = useStore((s) => s.cast);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard icon={<Users size={20} />} label="Cast Members" value={cast.length} />
      <StatCard icon={<Activity size={20} />} label="Leads" value={cast.filter((c) => c.category === "lead").length} />
      <StatCard icon={<Users size={20} />} label="Supporting" value={cast.filter((c) => c.category === "supporting").length} />
      <StatCard icon={<Users size={20} />} label="Day Players" value={cast.filter((c) => c.category === "day_player").length} />
    </div>
  );
}

// ============================================================
// helpers
// ============================================================

function LegendDot({ color, label, square, line }: { color: string; label: string; square?: boolean; line?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
      <span
        className={square ? "w-2.5 h-2.5" : line ? "w-3 h-0.5" : "w-2 h-2 rounded-full"}
        style={{ background: color, border: square ? `1px dashed ${color}` : undefined }}
      />
      {label}
    </span>
  );
}

function DeptIcon({ d }: { d: DepartmentId }) {
  const map: Record<string, React.ReactNode> = {
    camera: <Camera size={12} className="text-[var(--text-secondary)]" />,
    sound: <Radio size={12} className="text-[var(--text-secondary)]" />,
    vfx: <Sparkles size={12} className="text-[var(--text-secondary)]" />,
    art: <Palette size={12} className="text-[var(--text-secondary)]" />,
    wardrobe: <Palette size={12} className="text-[var(--text-secondary)]" />,
    props: <Palette size={12} className="text-[var(--text-secondary)]" />,
    accounting: <DollarSign size={12} className="text-[var(--text-secondary)]" />,
    transport: <Calendar size={12} className="text-[var(--text-secondary)]" />,
  };
  return <>{map[d] ?? <Activity size={12} />}</>;
}

function deptRoute(d: DepartmentId): string {
  if (d === "camera") return "/camera";
  if (d === "sound") return "/rf";
  if (d === "vfx") return "/vfx";
  if (d === "art" || d === "wardrobe" || d === "props") return "/art";
  if (d === "accounting") return "/budget";
  return "/tasks";
}
