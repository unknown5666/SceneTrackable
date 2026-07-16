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
import {
  setApiKey,
  hasApiKey,
  providerForModel,
  MODELS,
  PROVIDER_LABELS,
  PROVIDER_KEY_HINTS,
  type AIProvider,
} from "@/lib/claude";
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

/** Features that route to the light model when one is configured (WO-9). */
const LIGHT_FEATURES: AIFeature[] = ["daily_digest", "report_narration", "nl_query"];

export function AISettings() {
  const aiUsage = useStore((s) => s.aiUsage);
  const aiConfig = useStore((s) => s.aiConfig);
  const setConfig = useStore((s) => s.setAIConfig);

  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  // Which provider's key the card is editing. Defaults to the main model's —
  // that's the one the next breakdown needs — but both are reachable, because
  // a light model can sit on the other provider.
  const [keyProvider, setKeyProvider] = useState<AIProvider | null>(null);

  const provider: AIProvider = keyProvider ?? providerForModel(aiConfig.model);
  const keyHint = PROVIDER_KEY_HINTS[provider];
  const keySet = hasApiKey(provider);
  const lightProvider = aiConfig.lightModel ? providerForModel(aiConfig.lightModel) : null;
  // Re-render the key card when a key is saved/removed for the shown provider.
  const [, bumpKeys] = useState(0);

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
    setApiKey(keyInput.trim() || null, provider);
    setKeyInput("");
    bumpKeys((n) => n + 1);
  };

  const removeKey = () => {
    setApiKey(null, provider);
    setKeyInput("");
    bumpKeys((n) => n + 1);
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div>
        <div className="section-header">AI Integration</div>
        <div className="page-title mt-1">Token Usage & Settings</div>
      </div>

      {/* Key management */}
      <Card variant="ai">
        <CardHeader
          title={
            <div className="flex items-center gap-2">
              <Key size={14} className="text-[var(--color-ai)]" />
              {PROVIDER_LABELS[provider]} API Key
            </div>
          }
          subtitle="Keys are stored locally in localStorage — never sent to our servers. Each provider has its own key."
        />
        <div className="flex items-center gap-2 mb-3">
          {(["anthropic", "google"] as AIProvider[]).map((p) => (
            <button
              key={p}
              onClick={() => {
                setKeyProvider(p);
                setKeyInput("");
              }}
              className={cn(
                "text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-2",
                provider === p
                  ? "border-[var(--accent-blue)] bg-[var(--active-tint)] text-[var(--text-primary)]"
                  : "border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
              )}
            >
              {PROVIDER_LABELS[p]}
              {hasApiKey(p) && <Badge tone="success">Key set</Badge>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <input
              type={showKey ? "text" : "password"}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={keySet ? `${keyHint.placeholder}  (key set)` : keyHint.placeholder}
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
          {keySet && (
            <Button variant="destructive" size="sm" onClick={removeKey}>
              Remove
            </Button>
          )}
        </div>
        {!keySet && (
          <div className="mt-3 text-xs text-[var(--text-secondary)]">
            Get a key at <span className="text-[var(--color-ai)]">{keyHint.console}</span>. Without one,
            SceneTrackable runs an intelligent <span className="text-[var(--color-ai)]">demo breakdown</span> so the
            app works out of the box.
          </div>
        )}
        {provider === "google" && (
          <div className="mt-3 flex items-start gap-2 text-xs text-[var(--text-secondary)]">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-[var(--color-warning)]" />
            <span>
              Google's <strong>free tier uses your prompts to improve their models</strong> — screenplays sent on a
              free-tier key are not confidential. Use it for testing and demos; move to a paid Gemini key or Claude
              before running a client's script.
            </span>
          </div>
        )}
      </Card>

      {/* Model */}
      <Card>
        <CardHeader
          title="Model"
          subtitle="Which model performs the breakdown. Selecting a model also selects its provider."
        />
        <div className="space-y-4">
          {(["anthropic", "google"] as AIProvider[]).map((p) => (
            <div key={p}>
              <div className="section-header mb-1.5">{PROVIDER_LABELS[p]}</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {MODELS.filter((m) => m.provider === p).map((m) => (
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
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{m.label}</span>
                      {m.freeTier && <Badge tone="success">Free tier</Badge>}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Light-task model */}
      <Card>
        <CardHeader
          title="Light Tasks Model"
          subtitle={`Small, frequent work — ${LIGHT_FEATURES.map((f) => FEATURE_LABELS[f]).join(
            ", "
          )} — can run on a cheaper model than the breakdown. Set one to keep those free while the main model stays heavyweight. Needs a key for its provider; without one, light work falls back to the main model.`}
        />
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => setConfig({ lightModel: undefined })}
              className={cn(
                "text-left p-3 rounded-card border transition-colors",
                !aiConfig.lightModel
                  ? "border-[var(--accent-blue)] bg-[var(--active-tint)]"
                  : "border-[var(--border-default)] hover:border-[var(--border-hover)]"
              )}
            >
              <div className="text-sm font-medium text-[var(--text-primary)]">
                Use the main model
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Everything runs on {MODELS.find((m) => m.id === aiConfig.model)?.label ?? aiConfig.model}
              </div>
            </button>
            {MODELS.map((m) => {
              const selected = aiConfig.lightModel === m.id;
              const usable = hasApiKey(m.provider);
              return (
                <button
                  key={m.id}
                  onClick={() => setConfig({ lightModel: m.id })}
                  className={cn(
                    "text-left p-3 rounded-card border transition-colors",
                    selected
                      ? "border-[var(--accent-blue)] bg-[var(--active-tint)]"
                      : "border-[var(--border-default)] hover:border-[var(--border-hover)]"
                  )}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-[var(--text-primary)]">{m.label}</span>
                    {m.freeTier && <Badge tone="success">Free tier</Badge>}
                    {selected && !usable && <Badge tone="warning">No key</Badge>}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {PROVIDER_LABELS[m.provider]}
                  </div>
                </button>
              );
            })}
          </div>
          {lightProvider === "google" && (
            <div className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
              <AlertCircle size={14} className="mt-0.5 shrink-0 text-[var(--color-warning)]" />
              <span>
                Digests and answers include production data — scene headings, cast names, budget
                figures. On Google's <strong>free tier those prompts train their models</strong>. Fine
                for a demo; use a paid key for a real production.
              </span>
            </div>
          )}
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
