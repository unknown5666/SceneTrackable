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
  Loader2,
  MessageCircleQuestion,
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
import {
  aiAskProduction,
  aiDailyDigest,
  demoDigest,
  hasApiKey,
} from "@/lib/claude";
import { demoAnswer } from "@/lib/askDemo";
import { buildSnapshot } from "@/lib/snapshot";
import {
  buildDigestInput,
  buildPaceChart,
  buildSpendChart,
  computeMetrics,
  radarAxes,
  shotSceneIds,
} from "@/lib/metrics";
import { FolderKanban, Upload } from "lucide-react";
import type { ProductionData, RoleId, DepartmentId } from "@/types";

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
  const tasks = useStore((s) => s.tasks);
  const purchaseOrders = useStore((s) => s.purchaseOrders);
  const budgetLines = useStore((s) => s.budgetLines);
  const crew = useStore((s) => s.crew);

  const advancePO = useStore((s) => s.advancePO);
  const currentUserId = useStore((s) => s.currentUserId);
  const data = useProductionData();

  // Every KPI on this page comes from here. Anything it can't compute comes
  // back undefined and is rendered as "not tracked", never as a placeholder.
  const m = useMemo(() => computeMetrics(data), [data]);
  const scheduleChart = useMemo(() => buildPaceChart(data), [data]);
  const radarData = useMemo(() => radarAxes(m), [m]);

  const overdueTasks = tasks.filter(
    (t) => t.status !== "completed" && isOverdue(t.computedDeadline)
  );

  const healthTone: "success" | "warning" | "danger" | undefined =
    m.health === undefined
      ? undefined
      : m.health >= 80
      ? "success"
      : m.health >= 60
      ? "warning"
      : "danger";

  const burnTone: "success" | "warning" | "danger" | undefined =
    m.budgetBurn === undefined || m.scheduleProgress === undefined
      ? undefined
      : m.budgetBurn < m.scheduleProgress - 0.05
      ? "success"
      : m.budgetBurn > m.scheduleProgress + 0.05
      ? "danger"
      : "warning";

  const healthHistory = useStore((s) => s.healthHistory);
  const recordHealth = useStore((s) => s.recordHealth);

  // The sparkline needs history, and the only honest source of it is history:
  // one snapshot per day, appended as the dashboard is opened.
  React.useEffect(() => {
    if (m.health !== undefined) recordHealth(m.health);
  }, [m.health, recordHealth]);

  const healthTrend = useMemo(() => {
    if (healthHistory.length < 2) return undefined;
    const first = healthHistory[0].health;
    const last = healthHistory[healthHistory.length - 1].health;
    const delta = last - first;
    const dir = delta > 1 ? "up" : delta < -1 ? "down" : "flat";
    return {
      direction: dir as "up" | "down" | "flat",
      label:
        dir === "flat"
          ? `Steady over ${healthHistory.length} days`
          : `${delta > 0 ? "+" : ""}${delta} over ${healthHistory.length} days`,
      upIsGood: true,
    };
  }, [healthHistory]);

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

  const digest = useDailyDigest(data);

  return (
    <>
      {/* Row 1 — KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Activity size={20} />}
          label="Production Health"
          value={m.health === undefined ? "—" : `${m.health}`}
          hint={
            m.health === undefined
              ? "Needs a schedule, budget or tasks"
              : "Composite score / 100"
          }
          tone={healthTone}
          trend={healthTrend}
          // Only a real series is worth drawing; one point is not a trend.
          sparklineData={
            healthHistory.length >= 2
              ? healthHistory.map((h) => ({ v: h.health }))
              : undefined
          }
        />
        <StatCard
          icon={<Calendar size={20} />}
          label="Days Shot"
          value={`${m.daysShot} / ${m.totalDays || "—"}`}
          hint={
            m.scheduleProgress === undefined
              ? "No shoot days scheduled"
              : m.pagesPerDay === undefined
              ? `${Math.round(m.scheduleProgress * 100)}% of schedule · no scenes on shot days`
              : `${Math.round(m.scheduleProgress * 100)}% of schedule`
          }
          trend={
            m.pagesPerDayDelta === undefined
              ? undefined
              : {
                  direction:
                    m.pagesPerDayDelta > 0.05
                      ? "up"
                      : m.pagesPerDayDelta < -0.05
                      ? "down"
                      : "flat",
                  label: `${Math.abs(m.pagesPerDayDelta).toFixed(2)} pages/day ${
                    m.pagesPerDayDelta < 0 ? "behind" : "ahead of"
                  } target`,
                  upIsGood: true,
                }
          }
        />
        <StatCard
          icon={<DollarSign size={20} />}
          label="Budget Burn"
          value={m.budgetBurn === undefined ? "—" : `${Math.round(m.budgetBurn * 100)}%`}
          hint={
            m.budgetBurn === undefined
              ? "No budget lines loaded"
              : m.scheduleProgress === undefined
              ? "Spent vs budget"
              : `Spent vs ${Math.round(m.scheduleProgress * 100)}% schedule`
          }
          tone={burnTone}
          trend={
            m.totalSpent > 0
              ? {
                  direction: "up",
                  label: `${formatCurrency(m.totalSpent, production.currency)} spent`,
                  upIsGood: false,
                }
              : undefined
          }
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
          subtitle="Pages scheduled per shoot day against the daily target, with the cumulative page count"
          right={
            <div className="flex items-center gap-3 text-xs">
              <LegendDot color="var(--accent-blue)" label="Shot" />
              <LegendDot color="rgba(79,123,247,0.35)" label="Upcoming" />
              <LegendDot color="var(--color-warning)" line label="Target/day" />
              <LegendDot color="var(--color-success)" line label="Cumulative" />
            </div>
          }
        />
        {scheduleChart.length === 0 ? (
          <EmptyState
            icon={<Calendar size={40} />}
            title="No shoot days on the board"
            subtitle="Build the strip board and this chart tracks pages per day against your target."
          />
        ) : (
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
              <Bar yAxisId="pages" dataKey="shot" name="Shot" fill="var(--accent-blue)" radius={[2, 2, 0, 0]} />
              <Bar
                yAxisId="pages"
                dataKey="upcoming"
                name="Upcoming"
                fill="rgba(79,123,247,0.35)"
                radius={[2, 2, 0, 0]}
              />
              <Line
                yAxisId="pages"
                type="monotone"
                dataKey="target"
                name="Target/day"
                stroke="var(--color-warning)"
                strokeDasharray="4 4"
                dot={false}
                strokeWidth={2}
              />
              <Line
                yAxisId="cumul"
                type="monotone"
                dataKey="cumulativeScheduled"
                name="Cumulative scheduled"
                stroke="rgba(34,197,94,0.4)"
                strokeDasharray="4 4"
                dot={false}
                strokeWidth={2}
              />
              <Line
                yAxisId="cumul"
                type="monotone"
                dataKey="cumulativeShot"
                name="Cumulative shot"
                stroke="var(--color-success)"
                dot={false}
                strokeWidth={2}
                connectNulls={false}
              />
              {m.daysShot > 0 && (
                <ReferenceLine
                  yAxisId="pages"
                  x={m.daysShot}
                  stroke="var(--text-secondary)"
                  strokeDasharray="2 2"
                  label={{
                    value: "Today",
                    fill: "var(--text-secondary)",
                    fontSize: 10,
                    position: "top",
                  }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        )}
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
            title="Production Dimensions"
            subtitle={
              radarData.length >= 3
                ? `Target vs actual across the ${radarData.length} dimensions this production tracks`
                : "Target vs actual across production dimensions"
            }
          />
          {/* Two spokes is a shape, not a chart — and axes with no underlying
              data are exactly what this rewrite removed. */}
          {radarData.length < 3 ? (
            <EmptyState
              icon={<Activity size={40} />}
              title="Not enough tracked yet"
              subtitle="This chart appears once at least three of pace, scene completion, budget, tasks, VFX or equipment have data behind them."
            />
          ) : (
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
                  name="Target"
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
          )}
        </Card>

        <Card variant="ai">
          <CardHeader
            title={
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-[var(--color-ai)]" />
                <span>AI Insights</span>
              </div>
            }
            subtitle={
              digest.staleness === "stale"
                ? "The production has changed since this digest — regenerate for the current picture."
                : digest.at
                ? `Daily digest · generated ${formatDate(digest.at)}`
                : "Daily digest of the current production state"
            }
            right={
              <Button variant="ai" size="sm" onClick={digest.run} loading={digest.loading}>
                <RefreshCw size={12} /> {digest.text ? "Regenerate" : "Generate"}
              </Button>
            }
          />
          {digest.error ? (
            <div className="text-sm text-[var(--color-danger)]">{digest.error}</div>
          ) : !digest.text ? (
            <EmptyState
              icon={<Sparkles size={40} />}
              title="No digest yet"
              subtitle="Generate a digest of overdue tasks, budget pressure, upcoming location locks and cast conflicts."
            />
          ) : (
            <>
              <div className="whitespace-pre-wrap text-sm text-[var(--text-primary)] leading-relaxed">
                {digest.text}
              </div>
              <div className="mt-4 pt-3 border-t border-[var(--border-default)] flex items-center gap-2 flex-wrap">
                {digest.tokens !== undefined && (
                  <Badge tone="ai">{formatCompact(digest.tokens)} tokens</Badge>
                )}
                {digest.staleness === "stale" && <Badge tone="warning">Out of date</Badge>}
                {digest.fromMock && <Badge tone="muted">Demo mode</Badge>}
              </div>
            </>
          )}
        </Card>
      </div>

      <AskProduction data={data} />
    </>
  );
}

// ============================================================
// SHARED HOOKS
// ============================================================

/** The active project's data, in the shape the metric and AI helpers take. */
function useProductionData(): ProductionData {
  const production = useStore((s) => s.production);
  const scenes = useStore((s) => s.scenes);
  const shootDays = useStore((s) => s.shootDays);
  const cast = useStore((s) => s.cast);
  const crew = useStore((s) => s.crew);
  const dood = useStore((s) => s.dood);
  const tasks = useStore((s) => s.tasks);
  const budgetLines = useStore((s) => s.budgetLines);
  const purchaseOrders = useStore((s) => s.purchaseOrders);
  const pettyCash = useStore((s) => s.pettyCash);
  const locations = useStore((s) => s.locations);
  const vfxShots = useStore((s) => s.vfxShots);
  const equipmentCheckouts = useStore((s) => s.equipmentCheckouts);

  return useMemo(
    () =>
      ({
        production,
        scenes,
        shootDays,
        cast,
        crew,
        dood,
        tasks,
        budgetLines,
        purchaseOrders,
        pettyCash,
        locations,
        vfxShots,
        equipmentCheckouts,
      } as unknown as ProductionData),
    [
      production,
      scenes,
      shootDays,
      cast,
      crew,
      dood,
      tasks,
      budgetLines,
      purchaseOrders,
      pettyCash,
      locations,
      vfxShots,
      equipmentCheckouts,
    ]
  );
}

/**
 * The daily digest, cached against a hash of the numbers it was written from.
 *
 * Two things this buys: the digest doesn't cost a request on every dashboard
 * visit, and when the production moves underneath it the card can say the
 * digest is out of date instead of quietly showing yesterday's news as today's.
 */
function useDailyDigest(data: ProductionData) {
  const cached = useStore((s) => s.aiDigest);
  const setAIDigest = useStore((s) => s.setAIDigest);
  const recordAIUsage = useStore((s) => s.recordAIUsage);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fromMock, setFromMock] = useState(false);
  const [tokens, setTokens] = useState<number | undefined>(undefined);

  const input = useMemo(() => buildDigestInput(data), [data]);

  const run = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { digest, result } = await aiDailyDigest(input.text);
      // Demo mode echoes the facts only — the notes in `text` are addressed to
      // the model and would read as nonsense on the dashboard.
      const text = result.fromMock ? demoDigest(input.facts) : digest;
      recordAIUsage({
        feature: "daily_digest",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        model: result.model,
        costUsd: result.costUsd,
      });
      setFromMock(result.fromMock);
      setTokens(result.inputTokens + result.outputTokens);
      setAIDigest({
        at: new Date().toISOString(),
        text,
        hash: input.hash,
        model: result.model,
      });
    } catch (e) {
      setError((e as Error).message || "Couldn't generate the digest.");
    } finally {
      setLoading(false);
    }
  }, [input, recordAIUsage, setAIDigest]);

  // Auto-run at most once a day, and only when the numbers have actually
  // moved — a regenerate that would produce the same text isn't worth a call.
  const ranRef = React.useRef(false);
  React.useEffect(() => {
    if (ranRef.current || loading) return;
    if (!hasApiKey()) return;
    const today = new Date().toISOString().slice(0, 10);
    const fresh = cached && cached.hash === input.hash;
    const ranToday = cached?.at.slice(0, 10) === today;
    if (fresh || ranToday) return;
    ranRef.current = true;
    void run();
  }, [cached, input.hash, loading, run]);

  return {
    text: cached?.text ?? null,
    at: cached?.at,
    staleness: cached && cached.hash !== input.hash ? ("stale" as const) : ("fresh" as const),
    loading,
    error,
    fromMock,
    tokens,
    run,
  };
}

// ============================================================
// ASK THE PRODUCTION
// ============================================================

interface QA {
  question: string;
  answer: string;
  fromMock: boolean;
  omitted: string[];
}

/**
 * A question box over a compact snapshot of the production — one request per
 * question, no script text, and an answer the model is instructed to draw only
 * from the data it was handed.
 */
function AskProduction({ data }: { data: ProductionData }) {
  const project = useStore(activeProject);
  const recordAIUsage = useStore((s) => s.recordAIUsage);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QA[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    try {
      const snapshot = buildSnapshot(data);
      // `history` renders newest-first; the model wants the conversation
      // oldest-first, questions and answers as their own turns.
      const turns = history
        .slice()
        .reverse()
        .filter((qa) => !qa.fromMock)
        .flatMap((qa) => [
          { role: "user" as const, content: qa.question },
          { role: "assistant" as const, content: qa.answer },
        ]);
      const { answer, result } = await aiAskProduction(text, snapshot.json, project?.name, turns);
      recordAIUsage({
        feature: "nl_query",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        model: result.model,
        costUsd: result.costUsd,
      });
      setHistory((h) => [
        {
          question: text,
          // Demo mode has no model to reason with — the keyword lookup stands
          // in, and says so rather than dressing itself up as an answer.
          answer: result.fromMock ? demoAnswer(text, data) : answer,
          fromMock: result.fromMock,
          omitted: snapshot.omitted,
        },
        ...h,
      ]);
      setQuestion("");
    } catch (e) {
      setError((e as Error).message || "Couldn't answer that.");
    } finally {
      setBusy(false);
    }
  };

  const suggestions = [
    "Which days is the cast heaviest?",
    "What's unspent in art?",
    "Which locations aren't locked yet?",
    "What's overdue this week?",
  ];

  return (
    <Card variant="ai">
      <CardHeader
        title={
          <div className="flex items-center gap-2">
            <MessageCircleQuestion size={14} className="text-[var(--color-ai)]" />
            <span>Ask the production</span>
          </div>
        }
        subtitle="Questions answered from this project's schedule, cast, budget, tasks and locations. Follow-ups work — it remembers the conversation."
      />
      <div className="flex items-center gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(question)}
          placeholder="e.g. which days is BEA on set?"
          className="flex-1"
          disabled={busy}
        />
        <Button variant="ai" onClick={() => ask(question)} disabled={busy || !question.trim()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          Ask
        </Button>
      </div>

      {history.length === 0 && !error && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              disabled={busy}
              className="text-[11px] px-2 py-1 rounded-badge border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <div className="text-xs text-[var(--color-danger)] mt-3">{error}</div>}

      {history.length > 0 && (
        <div className="mt-4 space-y-3">
          {history.map((qa, i) => (
            <div
              key={i}
              className="p-3 rounded-lg border border-[var(--border-default)]"
              style={{ background: "var(--bg-elevated)" }}
            >
              <div className="text-xs text-[var(--text-muted)]">{qa.question}</div>
              <div className="text-sm text-[var(--text-primary)] mt-1.5 whitespace-pre-wrap leading-relaxed">
                {qa.answer}
              </div>
              {(qa.fromMock || qa.omitted.length > 0) && (
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  {qa.fromMock && <Badge tone="muted">Demo mode</Badge>}
                  {qa.omitted.length > 0 && (
                    <Badge tone="warning">
                      {qa.omitted.join(", ")} omitted — too large to send
                    </Badge>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
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
  const dood = useStore((s) => s.dood);
  const cast = useStore((s) => s.cast);
  const data = useProductionData();

  const overdue = tasks.filter(
    (t) => (t.department === "production" || t.department === "cast") &&
      t.status !== "completed" &&
      isOverdue(t.computedDeadline)
  ).length;

  const scenesLeft = scenes.length - shotSceneIds(data).size;
  // The DOOD is the record of who's on hold, so read it rather than guess.
  const onHoldToday = cast.filter(
    (c) => dood[c.id]?.[production.currentShootDay] === "H"
  ).length;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Calendar size={20} />} label="Days Shot" value={`${production.currentShootDay} / ${production.totalShootDays || "—"}`} />
        <StatCard icon={<Film size={20} />} label="Scenes Left" value={scenesLeft} hint={`of ${scenes.length}`} />
        <StatCard icon={<AlertCircle size={20} />} label="Overdue" value={overdue} tone={overdue ? "danger" : "success"} />
        <StatCard
          icon={<Users size={20} />}
          label="Cast on Hold Today"
          value={onHoldToday}
          hint={production.currentShootDay ? `Day ${production.currentShootDay}` : "No current day set"}
        />
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

  const data = useProductionData();
  // Built from dated records — petty cash and POs. Budget lines carry no
  // dates, so they cannot produce a time series; the previous version of this
  // chart filled the gap with Math.random().
  const spendData = useMemo(() => buildSpendChart(data), [data]);

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
          <CardHeader
            title="Weekly Burn"
            subtitle="Approved POs and petty cash by week, against POs still awaiting approval"
          />
          {spendData.length === 0 ? (
            <EmptyState
              icon={<DollarSign size={40} />}
              title="No dated spend yet"
              subtitle="This chart is built from purchase orders and petty cash entries. Log some and the weekly burn appears here."
            />
          ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={spendData}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="week" stroke="var(--text-muted)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompact(v)} />
                <Tooltip contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--border-default)", borderRadius: 8 }} />
                <Bar dataKey="spent" name="Spent" stackId="a" fill="var(--accent-blue)" radius={[0, 0, 0, 0]} />
                <Bar
                  dataKey="committed"
                  name="Awaiting approval"
                  stackId="a"
                  fill="var(--color-warning)"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
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
  const shootDays = useStore((s) => s.shootDays);
  const production = useStore((s) => s.production);
  const openChecks = checklists.reduce(
    (s, c) => s + c.items.filter((i) => !i.done).length,
    0
  );
  // The next day still ahead on the board — not a number typed into the page.
  const nextDay = [...shootDays]
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .find((d) => d.dayNumber > production.currentShootDay);
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Camera size={20} />} label="Kits" value={cameraKits.length} />
        <StatCard icon={<Check size={20} />} label="Checkouts" value={equipmentCheckouts.length} />
        <StatCard icon={<AlertCircle size={20} />} label="Open Checklist Items" value={openChecks} tone={openChecks > 5 ? "warning" : "neutral"} />
        <StatCard
          icon={<Calendar size={20} />}
          label="Next Shoot Day"
          value={nextDay ? `Day ${nextDay.dayNumber}` : "—"}
          hint={nextDay?.date ? formatDate(nextDay.date) : "Nothing scheduled ahead"}
        />
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
