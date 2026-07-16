import React, { useMemo, useState } from "react";
import { FileDown, Printer, FileText, Eye } from "lucide-react";
import { useStore } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ProductionData } from "@/types";
import {
  REPORTS,
  getReport,
  exportReportCSV,
  printReport,
  type ReportId,
} from "@/lib/reports";

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
  const activeProjectId = useStore((s) => s.activeProjectId);

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
      } as unknown as ProductionData),
    [production, crew, cast, scenes, shootDays, dood, tasks, budgetLines]
  );

  const [preview, setPreview] = useState<ReportId | null>(null);

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
                  onClick={() => setPreview(def.id)}
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
                onClick={() => printReport(previewTable.def, data)}
              >
                Print / PDF
              </Button>
            </div>
          </div>
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
    <div className="mb-6">
      <div className="section-header">Reports</div>
      <div className="page-title mt-1">Extract Reports</div>
      <div className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
        Preview and export production reports as CSV (for Excel / Google Sheets)
        or print to PDF.
      </div>
    </div>
  );
}
