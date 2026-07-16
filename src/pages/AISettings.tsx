import React, { useState, useMemo } from "react";
import {
  Sparkles,
  Key,
  BarChart3,
  Settings,
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react";
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
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { formatCompact, formatDate, cn } from "@/lib/utils";
import { setApiKey, hasApiKey } from "@/lib/claude";
import type { AIFeature } from "@/types";

const FEATURE_LABELS: Record<AIFeature, string> = {
  script_breakdown: "Script Breakdown",
  daily_digest: "Daily Digest",
  task_proposals: "Task Proposals",
  nl_query: "NL Query",
  report_narration: "Report Narration",
};

const FEATURE_EST: Record<AIFeature, { avgIn: number; avgOut: number; perUnit: string }> = {
  script_breakdown: { avgIn: 1500, avgOut: 1000, perUnit: "per page" },
  daily_digest: { avgIn: 500, avgOut: 300, perUnit: "per role/day" },
  task_proposals: { avgIn: 800, avgOut: 500, perUnit: "per scene" },
  nl_query: { avgIn: 600, avgOut: 200, perUnit: "per query" },
  report_narration: { avgIn: 800, avgOut: 400, perUnit: "per report" },
};

export function AISettings() {
  const aiUsage = useStore((s) => s.aiUsage);
  const aiConfig = useStore((s) => s.aiConfig);
  const setConfig = useStore((s) => s.setAIConfig);

  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);

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

  const saveKey = () => {
    setApiKey(keyInput.trim() || null);
    setKeyInput("");
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div>
        <div className="section-header">AI / Claude Integration</div>
        <div className="page-title mt-1">Token Usage & Settings</div>
      </div>

      {/* Key management */}
      <Card variant="ai">
        <CardHeader
          title={
            <div className="flex items-center gap-2">
              <Key size={14} className="text-[var(--color-ai)]" />
              API Key
            </div>
          }
          subtitle="Your key is stored locally in localStorage — never sent to our servers."
        />
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <input
              type={showKey ? "text" : "password"}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={hasApiKey() ? "sk-ant-…  (key set)" : "sk-ant-api03-…"}
              className="w-full pr-10"
            />
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <Button variant="ai" onClick={saveKey}>
            Save
          </Button>
          {hasApiKey() && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { setApiKey(null); setKeyInput(""); }}
            >
              Remove
            </Button>
          )}
        </div>
        {!hasApiKey() && (
          <div className="mt-3 text-xs text-[var(--text-secondary)]">
            Without a key, SceneTrackable runs an intelligent <span className="text-[var(--color-ai)]">demo breakdown</span> so the
            app works out of the box. Add a key for live analysis by Claude.
          </div>
        )}
      </Card>

      {/* Model */}
      <Card>
        <CardHeader title="Model" subtitle="Which Claude model performs the breakdown." />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { id: "claude-opus-4-8", label: "Opus 4.8", desc: "Most capable · highest quality" },
            { id: "claude-sonnet-5", label: "Sonnet 5", desc: "Balanced · fast & cost-effective" },
            { id: "claude-haiku-4-5", label: "Haiku 4.5", desc: "Fastest · lowest cost" },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setConfig({ model: m.id })}
              className={cn(
                "text-left p-3 rounded-card border transition-colors",
                aiConfig.model === m.id
                  ? "border-[var(--accent-blue)] bg-[var(--active-tint)]"
                  : "border-[var(--border-default)] hover:border-[var(--border-hover)]"
              )}
            >
              <div className="text-sm font-medium text-[var(--text-primary)]">{m.label}</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{m.desc}</div>
            </button>
          ))}
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
