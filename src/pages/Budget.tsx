import React, { useState, useMemo } from "react";
import {
  DollarSign,
  ChevronRight,
  ChevronDown,
  Plus,
  Check,
  X,
  FileText,
  Upload,
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
import { useStore, canWrite } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useRecordEditor } from "@/components/ui/RecordEditor";
import { BudgetImportModal, BudgetImportButton } from "@/components/budget/BudgetImportModal";
import { formatCurrency, formatCompact, formatDate, formatDateTime, cn } from "@/lib/utils";

export function Budget() {
  const [tab, setTab] = useState("topsheet");
  const [importing, setImporting] = useState(false);
  const canEdit = useStore((s) => canWrite(s, "budget"));

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="mb-4 flex items-start justify-between gap-4" data-tour="page-header">
        <div>
          <div className="section-header">Budget & Accounting</div>
          <div className="page-title mt-1">Financial Overview</div>
        </div>
        {canEdit && <BudgetImportButton onClick={() => setImporting(true)} />}
      </div>

      <Tabs
        tabs={[
          { id: "topsheet", label: "Top Sheet" },
          { id: "charts", label: "Charts" },
          { id: "pos", label: "Purchase Orders" },
          { id: "petty", label: "Petty Cash" },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-6"
      />

      {tab === "topsheet" && <TopSheet onImport={() => setImporting(true)} />}
      {tab === "charts" && <BudgetCharts />}
      {tab === "pos" && <POList />}
      {tab === "petty" && <PettyCashList />}

      <BudgetImportModal open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

function TopSheet({ onImport }: { onImport: () => void }) {
  const budgetLines = useStore((s) => s.budgetLines);
  const production = useStore((s) => s.production);
  const [expanded, setExpanded] = useState<string[]>([]);
  const ed = useRecordEditor("budgetLines");

  const categories = useMemo(() => {
    const cats = new Map<string, typeof budgetLines>();
    for (const line of budgetLines) {
      const arr = cats.get(line.category) ?? [];
      arr.push(line);
      cats.set(line.category, arr);
    }
    return Array.from(cats.entries());
  }, [budgetLines]);

  const totalBudgeted = budgetLines.reduce((s, l) => s + l.budgeted, 0);
  const totalCommitted = budgetLines.reduce((s, l) => s + l.committed, 0);
  const totalSpent = budgetLines.reduce((s, l) => s + l.spent, 0);
  const totalRemaining = totalBudgeted - totalSpent;

  const toggle = (cat: string) =>
    setExpanded((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );

  if (budgetLines.length === 0) {
    return (
      <>
        <Card>
          <EmptyState
            icon={<DollarSign size={48} />}
            title="No budget lines yet"
            subtitle="Import the budget your accountant sent — PDF or CSV, Arabic or English — or start the top sheet by hand."
            cta={
              <div className="flex items-center gap-2">
                <Button size="md" leftIcon={<Upload size={14} />} onClick={onImport}>
                  Import Budget File
                </Button>
                <ed.AddButton size="md" variant="secondary" label="Add First Line" />
              </div>
            }
          />
        </Card>
        {ed.modal}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--text-secondary)]">
          {budgetLines.length} {budgetLines.length === 1 ? "line" : "lines"} across{" "}
          {categories.length} {categories.length === 1 ? "category" : "categories"}
        </div>
        <ed.AddButton label="Add Line" />
      </div>
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="pos-table">
          <thead>
            <tr>
              <th className="min-w-[240px]">Account</th>
              <th className="text-right">Budgeted</th>
              <th className="text-right">Committed</th>
              <th className="text-right">Spent</th>
              <th className="text-right">Remaining</th>
              <th className="text-right">Variance</th>
              <th className="text-right min-w-[100px]">% Used</th>
              <th className="w-[90px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map(([cat, lines]) => {
              const catBudgeted = lines.reduce((s, l) => s + l.budgeted, 0);
              const catCommitted = lines.reduce((s, l) => s + l.committed, 0);
              const catSpent = lines.reduce((s, l) => s + l.spent, 0);
              const catRemaining = catBudgeted - catSpent;
              const catVariance = catBudgeted - catCommitted;
              const catPct = catBudgeted > 0 ? (catSpent / catBudgeted) * 100 : 0;
              const isOpen = expanded.includes(cat);

              return (
                <React.Fragment key={cat}>
                  <tr
                    className="cursor-pointer font-medium"
                    style={{ background: "var(--bg-surface-hover)" }}
                    onClick={() => toggle(cat)}
                  >
                    <td>
                      <div className="flex items-center gap-2">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {cat}
                      </div>
                    </td>
                    <td className="text-right">{formatCurrency(catBudgeted, production.currency)}</td>
                    <td className="text-right">{formatCurrency(catCommitted, production.currency)}</td>
                    <td className="text-right">{formatCurrency(catSpent, production.currency)}</td>
                    <td className="text-right">{formatCurrency(catRemaining, production.currency)}</td>
                    <td className="text-right">
                      <span className={catVariance >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}>
                        {catVariance >= 0 ? "+" : ""}{formatCurrency(catVariance, production.currency)}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-16">
                          <ProgressBar
                            value={catPct}
                            tone={catPct > 90 ? "danger" : catPct > 75 ? "warning" : "success"}
                            height={4}
                          />
                        </div>
                        <span className="text-xs w-8 text-right">{catPct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td />
                  </tr>
                  {isOpen &&
                    lines.map((line) => {
                      const remaining = line.budgeted - line.spent;
                      const variance = line.budgeted - line.committed;
                      const pct = line.budgeted > 0 ? (line.spent / line.budgeted) * 100 : 0;
                      return (
                        <tr key={line.id}>
                          <td className="pl-10 text-[var(--text-secondary)]">
                            <span className="text-xs text-[var(--text-muted)] mr-2">{line.code}</span>
                            {line.description}
                          </td>
                          <td className="text-right text-[var(--text-secondary)]">{formatCurrency(line.budgeted, production.currency)}</td>
                          <td className="text-right text-[var(--text-secondary)]">{formatCurrency(line.committed, production.currency)}</td>
                          <td className="text-right">{formatCurrency(line.spent, production.currency)}</td>
                          <td className="text-right">{formatCurrency(remaining, production.currency)}</td>
                          <td className="text-right">
                            <span className={variance >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}>
                              {variance >= 0 ? "+" : ""}{formatCurrency(variance, production.currency)}
                            </span>
                          </td>
                          <td className="text-right">
                            <span className="text-xs">{pct.toFixed(0)}%</span>
                          </td>
                          <td>
                            <ed.RowActions id={line.id} />
                          </td>
                        </tr>
                      );
                    })}
                </React.Fragment>
              );
            })}
            {/* Grand total */}
            <tr className="font-semibold" style={{ background: "var(--bg-surface-hover)" }}>
              <td>Total</td>
              <td className="text-right">{formatCurrency(totalBudgeted, production.currency)}</td>
              <td className="text-right">{formatCurrency(totalCommitted, production.currency)}</td>
              <td className="text-right">{formatCurrency(totalSpent, production.currency)}</td>
              <td className="text-right">{formatCurrency(totalRemaining, production.currency)}</td>
              <td className="text-right">
                <span className={totalBudgeted - totalCommitted >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}>
                  {formatCurrency(totalBudgeted - totalCommitted, production.currency)}
                </span>
              </td>
              <td className="text-right">
                {totalBudgeted > 0 ? ((totalSpent / totalBudgeted) * 100).toFixed(0) : 0}%
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
      {ed.modal}
    </div>
  );
}

function BudgetCharts() {
  const budgetLines = useStore((s) => s.budgetLines);
  const production = useStore((s) => s.production);

  const cumulativeData = useMemo(() => {
    const weeks = 8;
    const totalBudgeted = budgetLines.reduce((s, l) => s + l.budgeted, 0);
    const weeklyPlanned = totalBudgeted / weeks;
    let cPlanned = 0;
    let cActual = 0;
    return Array.from({ length: weeks }, (_, i) => {
      cPlanned += weeklyPlanned;
      cActual += weeklyPlanned * (0.7 + Math.random() * 0.5);
      return {
        week: `W${i + 1}`,
        planned: Math.round(cPlanned),
        actual: Math.round(Math.min(cActual, cPlanned * 1.1)),
      };
    });
  }, [budgetLines]);

  const deptSpend = useMemo(() => {
    const deps = new Map<string, number>();
    for (const l of budgetLines) {
      const key = l.subcategory ?? l.category;
      deps.set(key, (deps.get(key) ?? 0) + l.spent);
    }
    return Array.from(deps.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [budgetLines]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader title="Cumulative Spend vs Budget" />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={cumulativeData}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="week" stroke="var(--text-muted)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompact(v)} />
              <Tooltip contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--border-default)", borderRadius: 8 }} />
              <Line type="monotone" dataKey="planned" stroke="var(--text-muted)" strokeDasharray="4 4" strokeWidth={2} dot={false} name="Planned" />
              <Line type="monotone" dataKey="actual" stroke="var(--accent-blue)" strokeWidth={2} dot={false} name="Actual" />
              <Legend />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardHeader title="Spend by Department" />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={deptSpend} layout="vertical">
              <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
              <XAxis type="number" stroke="var(--text-muted)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompact(v)} />
              <YAxis dataKey="name" type="category" stroke="var(--text-muted)" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={90} />
              <Tooltip contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--border-default)", borderRadius: 8 }} formatter={(v: number) => formatCurrency(v, production.currency)} />
              <Bar dataKey="value" fill="var(--accent-blue)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function POList() {
  const purchaseOrders = useStore((s) => s.purchaseOrders);
  const advancePO = useStore((s) => s.advancePO);
  const currentUserId = useStore((s) => s.currentUserId);
  const crew = useStore((s) => s.crew);
  const production = useStore((s) => s.production);

  const canReview = useStore((s) => canWrite(s, "budget"));

  const statusTone = (s: string) => {
    switch (s) {
      case "approved": return "success" as const;
      case "rejected": return "danger" as const;
      case "admin_approval":
      case "accountant_review":
      case "submitted": return "warning" as const;
      default: return "muted" as const;
    }
  };

  return (
    <Card padding="none">
      <div className="p-4">
        <CardHeader title="Purchase Orders" subtitle={`${purchaseOrders.length} total`} />
      </div>
      <div className="overflow-x-auto">
        <table className="pos-table">
          <thead>
            <tr>
              <th>PO #</th>
              <th>Vendor</th>
              <th>Description</th>
              <th className="text-right">Amount</th>
              <th>Status</th>
              <th>Submitted</th>
              {canReview && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {purchaseOrders.map((po) => {
              const requester = crew.find((c) => c.id === po.requestedBy);
              return (
                <tr key={po.id}>
                  <td className="font-mono text-xs">{po.number}</td>
                  <td>{po.vendor}</td>
                  <td className="max-w-[240px] truncate">{po.description}</td>
                  <td className="text-right font-medium">
                    {formatCurrency(po.amount, po.currency)}
                  </td>
                  <td>
                    <Badge tone={statusTone(po.status)}>
                      {po.status.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="text-xs text-[var(--text-secondary)]">
                    {requester?.name} · {formatDate(po.requestedAt)}
                  </td>
                  {canReview && (
                    <td>
                      {(po.status === "submitted" ||
                        po.status === "accountant_review" ||
                        po.status === "admin_approval") && (
                        <div className="flex gap-1">
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
                            <Check size={12} />
                          </Button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PettyCashList() {
  const pettyCash = useStore((s) => s.pettyCash);
  const crew = useStore((s) => s.crew);
  const production = useStore((s) => s.production);
  const balance = pettyCash.reduce((s, e) => s + e.amount, 0);
  const ed = useRecordEditor("pettyCash");

  if (pettyCash.length === 0) {
    return (
      <>
        <Card>
          <EmptyState
            icon={<FileText size={48} />}
            title="No petty cash logged"
            subtitle="Record each float spend as it happens to keep the running balance honest."
            cta={<ed.AddButton size="md" label="Log First Entry" />}
          />
        </Card>
        {ed.modal}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <div className="section-header">Running Balance</div>
            <div className="data-value mt-1">{formatCurrency(balance, production.currency)}</div>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone="info">{pettyCash.length} entries</Badge>
            <ed.AddButton label="Log Entry" />
          </div>
        </div>
      </Card>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="pos-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Department</th>
                <th className="text-right">Amount</th>
                <th>Logged By</th>
                <th className="w-[90px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pettyCash.map((entry) => {
                const logger = crew.find((c) => c.id === entry.loggedBy);
                return (
                  <tr key={entry.id}>
                    <td className="text-xs text-[var(--text-secondary)]">{formatDate(entry.date)}</td>
                    <td>{entry.description}</td>
                    <td><Badge tone="muted">{entry.department}</Badge></td>
                    <td className="text-right font-medium">{formatCurrency(entry.amount, entry.currency)}</td>
                    <td className="text-xs text-[var(--text-secondary)]">{logger?.name ?? "—"}</td>
                    <td>
                      <ed.RowActions id={entry.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {ed.modal}
    </div>
  );
}
