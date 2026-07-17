import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useStore } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatCompact, formatDate } from "@/lib/utils";
import { MODEL, PROVIDER_LABEL } from "@/lib/claude";
import type { AIFeature } from "@/types";

const FEATURE_LABELS: Record<AIFeature, string> = {
  script_breakdown: "Script Breakdown",
  character_bible: "Character Pass",
  location_bible: "Location Pass",
  daily_digest: "Daily Digest",
  task_proposals: "Task Proposals",
  schedule_draft: "Schedule Draft",
  nl_query: "Ask the Production",
  report_narration: "Report Narration",
};

const FEATURE_EST: Record<AIFeature, { avgIn: number; avgOut: number; perUnit: string }> = {
  // Scenes are batched, so a "unit" here is a batch of ~10 scenes.
  script_breakdown: { avgIn: 9000, avgOut: 9000, perUnit: "per 10 scenes" },
  // One pass over the entire screenplay, once per breakdown run.
  character_bible: { avgIn: 40000, avgOut: 3000, perUnit: "per script" },
  location_bible: { avgIn: 40000, avgOut: 2500, perUnit: "per script" },
  daily_digest: { avgIn: 1500, avgOut: 400, perUnit: "per day" },
  task_proposals: { avgIn: 6000, avgOut: 2500, perUnit: "per run" },
  schedule_draft: { avgIn: 8000, avgOut: 3000, perUnit: "per run" },
  nl_query: { avgIn: 8000, avgOut: 300, perUnit: "per question" },
  report_narration: { avgIn: 2500, avgOut: 250, perUnit: "per report" },
};

export function AISettings() {
  const aiUsage = useStore((s) => s.aiUsage);
  const aiConfig = useStore((s) => s.aiConfig);
  const setConfig = useStore((s) => s.setAIConfig);

  const totalIn = aiUsage.reduce((s, e) => s + e.inputTokens, 0);
  const totalOut = aiUsage.reduce((s, e) => s + e.outputTokens, 0);
  const totalCost = aiUsage.reduce((s, e) => s + e.costUsd, 0);

  // Usage by feature
  const byFeature = useMemo(() => {
    const map = new Map<AIFeature, { input: number; output: number; calls: number; cost: number }>();
    for (const e of aiUsage) {
      const prev = map.get(e.feature) ?? { input: 0, output: 0, calls: 0, cost: 0 };
      map.set(e.feature, {
        input: prev.input + e.inputTokens,
        output: prev.output + e.outputTokens,
        calls: prev.calls + 1,
        cost: prev.cost + e.costUsd,
      });
    }
    return map;
  }, [aiUsage]);

  // Usage over time for chart
  const chartData = useMemo(() => {
    const sorted = [...aiUsage].sort((a, b) => a.at.localeCompare(b.at));
    let cumIn = 0;
    let cumOut = 0;
    return sorted.map((e) => {
      cumIn += e.inputTokens;
      cumOut += e.outputTokens;
      return {
        date: formatDate(e.at),
        input: e.inputTokens,
        output: e.outputTokens,
        cumulative: cumIn + cumOut,
      };
    });
  }, [aiUsage]);

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div>
        <div className="section-header">AI Integration</div>
        <div className="page-title mt-1">Token Usage & Settings</div>
      </div>

      {/* Provider — fixed, nothing to configure */}
      <Card variant="ai">
        <CardHeader
          title={
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-[var(--color-ai)]" />
              AI Provider
            </div>
          }
          subtitle="Built in and ready — there is no key to enter and no model to pick."
        />
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-[var(--text-primary)]">{PROVIDER_LABEL}</span>
          <code className="text-xs text-[var(--text-secondary)]">{MODEL}</code>
          <Badge tone="success">Free tier</Badge>
        </div>
        <div className="mt-3 text-xs text-[var(--text-secondary)]">
          Screenplays and production data are sent to Z.ai on a free tier. Treat it as
          non-confidential — use it for testing and demos, not a client's unreleased script.
        </div>
      </Card>

      {/* Token dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <div className="section-header">Total Input Tokens</div>
          <div className="data-value mt-1">{formatCompact(totalIn)}</div>
        </Card>
        <Card>
          <div className="section-header">Total Output Tokens</div>
          <div className="data-value mt-1">{formatCompact(totalOut)}</div>
        </Card>
        <Card>
          <div className="section-header">Total Tokens</div>
          <div className="data-value mt-1">{formatCompact(totalIn + totalOut)}</div>
        </Card>
        <Card>
          <div className="section-header">Estimated Cost</div>
          <div className="data-value mt-1">${totalCost.toFixed(2)}</div>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader title="Token Usage Over Time" subtitle="Cumulative total" />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="date" stroke="var(--text-muted)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompact(v)} />
              <Tooltip contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--border-default)", borderRadius: 8 }} />
              <Line type="monotone" dataKey="cumulative" stroke="var(--color-ai)" strokeWidth={2} dot name="Cumulative tokens" />
              <Legend />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Feature breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Usage by Feature" />
          <div className="overflow-x-auto">
            <table className="pos-table text-sm">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th className="text-right">Calls</th>
                  <th className="text-right">Input</th>
                  <th className="text-right">Output</th>
                  <th className="text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byFeature.entries()).map(([feat, data]) => (
                  <tr key={feat}>
                    <td className="font-medium">{FEATURE_LABELS[feat]}</td>
                    <td className="text-right text-[var(--text-secondary)]">{data.calls}</td>
                    <td className="text-right">{formatCompact(data.input)}</td>
                    <td className="text-right">{formatCompact(data.output)}</td>
                    <td className="text-right font-medium">${data.cost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Token Estimates" subtitle="Reference per-use averages" />
          <div className="overflow-x-auto">
            <table className="pos-table text-sm">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th className="text-right">Avg Input</th>
                  <th className="text-right">Avg Output</th>
                  <th>Per</th>
                </tr>
              </thead>
              <tbody>
                {(Object.entries(FEATURE_EST) as [AIFeature, typeof FEATURE_EST[AIFeature]][]).map(
                  ([feat, est]) => (
                    <tr key={feat}>
                      <td className="font-medium">{FEATURE_LABELS[feat]}</td>
                      <td className="text-right">~{formatCompact(est.avgIn)}</td>
                      <td className="text-right">~{formatCompact(est.avgOut)}</td>
                      <td className="text-xs text-[var(--text-muted)]">{est.perUnit}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Budget cap */}
      <Card>
        <CardHeader title="Token Budget" subtitle="Set optional caps to control costs" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="section-header block mb-1.5">Daily Cap (tokens)</label>
            <input
              type="number"
              value={aiConfig.dailyBudgetTokens ?? ""}
              onChange={(e) => {
                const v = e.target.value ? parseInt(e.target.value) : undefined;
                setConfig({ dailyBudgetTokens: v });
              }}
              placeholder="No limit"
              className="w-full"
            />
          </div>
          <div>
            <label className="section-header block mb-1.5">Weekly Cap (tokens)</label>
            <input
              type="number"
              value={aiConfig.weeklyBudgetTokens ?? ""}
              onChange={(e) => {
                const v = e.target.value ? parseInt(e.target.value) : undefined;
                setConfig({ weeklyBudgetTokens: v });
              }}
              placeholder="No limit"
              className="w-full"
            />
          </div>
          <div>
            <label className="section-header block mb-1.5">Alert Threshold (%)</label>
            <input
              type="number"
              value={aiConfig.alertThresholdPct}
              onChange={(e) => setConfig({ alertThresholdPct: parseInt(e.target.value) || 80 })}
              className="w-full"
              min={50}
              max={100}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
