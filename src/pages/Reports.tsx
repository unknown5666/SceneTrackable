import React, { useMemo, useState } from "react";
import { FileDown, Printer, FileText, Eye, Sparkles, Loader2 } from "lucide-react";
import { useStore, activeProject } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { aiNarrateReport, NARRATION_ROW_CAP } from "@/lib/claude";
import { formatCompact } from "@/lib/utils";
import type { ProductionData } from "@/types";
import {
  REPORTS,
  getReport,
  exportReportCSV,
  printReport,
  type ReportId,
} from "@/lib/reports";
import { HelpButton } from "@/components/ui/HelpButton";

interface Narration {
  /** The report this describes — it must never be shown above another. */
  reportId: ReportId;
  text: string;
  tokens: number;
  fromMock: boolean;
  truncated: boolean;
}

export function Reports() {
  // Assemble a ProductionData view from the active project's store slices.
  const production = useStore((s) => s.production);
  const crew = useStore((s) => s.crew);
  const cast = useStore((s) => s.cast);
  const scenes = useStore((s) => s.scenes);
  const shootDays = useStore((s) => s.shootDays);
  const dood = useStore((s) => s.dood);
  const tasks = useStore((s) => s.tasks);
  const budgetLines = useStore((s) => s.budgetLines);
  const locations = useStore((s) => s.locations);
  const drones = useStore((s) => s.drones);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const project = useStore(activeProject);
  const recordAIUsage = useStore((s) => s.recordAIUsage);

  // Every slice a report reads must be listed here — a report that reaches for
  // a missing one gets `undefined`, not a type error.
  const data = useMemo(
    () =>
      ({
        production,
        crew,
        cast,
        scenes,
        shootDays,
        dood,
        tasks,
        budgetLines,
        locations,
        drones,
      } as unknown as ProductionData),
    [production, crew, cast, scenes, shootDays, dood, tasks, budgetLines, locations, drones]
  );

  const [preview, setPreview] = useState<ReportId | null>(null);
  const [narration, setNarration] = useState<Narration | null>(null);
  const [narrating, setNarrating] = useState(false);
  const [narrationError, setNarrationError] = useState("");

  // A narration describes one table; showing it above another would be a lie.
  const showPreview = (id: ReportId) => {
    setPreview(id);
    setNarration(null);
    setNarrationError("");
  };

  const narrate = async () => {
    if (!previewTable) return;
    setNarrating(true);
    setNarrationError("");
    try {
      const { def, table } = previewTable;
      const res = await aiNarrateReport(def.title, table.columns, table.rows, project?.name);
      recordAIUsage({
        feature: "report_narration",
        inputTokens: res.result.inputTokens,
        outputTokens: res.result.outputTokens,
        model: res.result.model,
        costUsd: res.result.costUsd,
      });
      setNarration({
        reportId: def.id,
        text: res.narration,
        tokens: res.result.inputTokens + res.result.outputTokens,
        fromMock: res.result.fromMock,
        truncated: res.truncated,
      });
    } catch (e) {
      setNarrationError((e as Error).message || "Couldn't narrate this report.");
    } finally {
      setNarrating(false);
    }
  };

  const activeNarration =
    narration && preview && narration.reportId === preview ? narration : null;

  const previewTable = useMemo(() => {
    if (!preview) return null;
    const def = getReport(preview);
    return def ? { def, table: def.build(data) } : null;
  }, [preview, data]);

  if (!activeProjectId) {
    return (
      <div className="max-w-[1400px] mx-auto">
        <Header />
        <Card>
          <EmptyState
            icon={<FileText size={48} />}
            title="No active project"
            subtitle="Open or create a project to generate and extract reports."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      <Header />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((def) => {
          const empty = def.isEmpty(data);
          const count = empty ? 0 : def.build(data).rows.length;
          return (
            <Card key={def.id} className="flex flex-col">
              <CardHeader
                title={def.title}
                subtitle={def.description}
                right={
                  <Badge tone={empty ? "muted" : "info"}>
                    {empty ? "No data" : `${count} rows`}
                  </Badge>
                }
              />
              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Eye size={14} />}
                  disabled={empty}
                  onClick={() => showPreview(def.id)}
                >
                  Preview
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  leftIcon={<FileDown size={14} />}
                  disabled={empty}
                  onClick={() => exportReportCSV(def, data)}
                >
                  CSV
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Printer size={14} />}
                  disabled={empty}
                  onClick={() => printReport(def, data)}
                >
                  PDF
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {previewTable && (
        <Card className="mt-6" padding="none">
          <div className="flex items-center justify-between p-4 border-b border-[var(--border-default)]">
            <div>
              <div className="section-header">{previewTable.def.title}</div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5">
                {previewTable.table.rows.length} rows
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ai"
                leftIcon={
                  narrating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />
                }
                disabled={narrating}
                onClick={narrate}
              >
                {activeNarration ? "Re-narrate" : "Narrate (AI)"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<FileDown size={14} />}
                onClick={() => exportReportCSV(previewTable.def, data)}
              >
                Export CSV
              </Button>
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<Printer size={14} />}
                onClick={() => printReport(previewTable.def, data, activeNarration?.text)}
              >
                Print / PDF
              </Button>
            </div>
          </div>

          {(activeNarration || narrationError) && (
            <div className="p-4 border-b border-[var(--border-default)] bg-[rgba(139,92,246,0.04)]">
              {narrationError ? (
                <div className="text-xs text-[var(--color-danger)]">{narrationError}</div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <div className="section-header">Summary</div>
                    <Badge tone="ai">{formatCompact(activeNarration!.tokens)} tokens</Badge>
                    {activeNarration!.fromMock && <Badge tone="muted">Demo mode</Badge>}
                    {activeNarration!.truncated && (
                      <Badge tone="warning">
                        First {NARRATION_ROW_CAP} rows only
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    {activeNarration!.text}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-2">
                    Included in Print / PDF. AI-written from the table below — check any figure you
                    plan to act on.
                  </div>
                </>
              )}
            </div>
          )}
          <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
            <table className="pos-table">
              <thead>
                <tr>
                  {previewTable.table.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewTable.table.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="mb-6" data-tour="page-header">
      <div className="section-header flex items-center gap-1.5">
        Reports <HelpButton doc="reports" />
      </div>
      <div className="page-title mt-1">Extract Reports</div>
      <div className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
        Preview and export production reports as CSV (for Excel / Google Sheets)
        or print to PDF.
      </div>
    </div>
  );
}
