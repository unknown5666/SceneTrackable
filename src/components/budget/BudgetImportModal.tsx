// ============================================================
// BUDGET IMPORT — upload, review, ask, land
//
// The review step is the point of this component, not a formality. A budget
// file is the one import where a confident guess is worse than a question:
// filing a row under the wrong section quietly moves money between departments
// on the top sheet, and a row whose amount was misread reports a production
// that costs less than it does. So `parseBudgetText` marks what it could not
// work out, and this screen refuses to import until a human has answered.
// ============================================================

import React, { useCallback, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Trash2,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useStore } from "@/state/store";
import { extractPdfText } from "@/lib/pdf";
import { pushToast } from "@/lib/toast";
import { formatCurrency, cn } from "@/lib/utils";
import {
  parseBudgetText,
  toBudgetLines,
  sectionLabel,
  BUDGET_SECTIONS,
  type ParsedBudget,
  type ParsedBudgetRow,
} from "@/lib/budgetImport";

type Step = "upload" | "review";

const ACCEPT = ".pdf,.csv,.tsv,.txt";

export function BudgetImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const importBudgetLines = useStore((s) => s.importBudgetLines);
  const production = useStore((s) => s.production);
  const existingCount = useStore((s) => s.budgetLines.length);

  const [step, setStep] = useState<Step>("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedBudget | null>(null);
  const [rows, setRows] = useState<ParsedBudgetRow[]>([]);
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setParsed(null);
    setRows([]);
    setError(null);
    setFileName("");
    setBusy(false);
  }, []);

  const close = () => {
    onClose();
    // Cleared after the exit animation, so the panel doesn't flash empty.
    window.setTimeout(reset, 250);
  };

  const ingest = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    setFileName(file.name);
    try {
      // The PDF path runs the same extraction the script importer does, so a
      // budget and a screenplay out of the same office read identically —
      // including the RTL repairs that decide whether 20,000 is 20,000.
      const text = /\.pdf$/i.test(file.name)
        ? (await extractPdfText(file)).text
        : await file.text();
      const result = parseBudgetText(text);
      if (result.rows.length === 0) {
        setError(
          "No budget rows found in that file. It may be a scan rather than text — try exporting the sheet as CSV."
        );
        setBusy(false);
        return;
      }
      setParsed(result);
      setRows(result.rows);
      setMode(existingCount > 0 ? "replace" : "append");
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    }
    setBusy(false);
  }, [existingCount]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void ingest(file);
    e.target.value = "";
  };

  const patch = (id: string, next: Partial<ParsedBudgetRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...next } : r)));

  const lang = parsed?.language ?? "en";
  const currency = parsed?.currency ?? production.currency;

  const unresolved = useMemo(
    () => rows.filter((r) => !r.section || r.amount === null),
    [rows]
  );
  const total = useMemo(
    () => rows.reduce((s, r) => s + (r.amount ?? 0), 0),
    [rows]
  );
  const drift =
    parsed?.declaredTotal != null ? total - parsed.declaredTotal : null;

  const doImport = () => {
    if (!parsed || unresolved.length > 0) return;
    const lines = toBudgetLines(rows, lang);
    importBudgetLines(lines, mode, { fileName, currency: parsed.currency });
    pushToast({
      title: `${lines.length} budget ${lines.length === 1 ? "line" : "lines"} imported`,
      description: `${formatCurrency(total, currency)} across ${new Set(lines.map((l) => l.category)).size} sections`,
      tone: "success",
    });
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title="Import budget file"
      subtitle={
        step === "upload"
          ? "PDF, CSV, TSV or plain text — Arabic or English."
          : `${fileName} · ${rows.length} ${rows.length === 1 ? "row" : "rows"}`
      }
      footer={
        step === "review" && (
          <div className="flex items-center justify-between gap-4 w-full">
            <div className="flex items-center gap-2">
              <ModeToggle mode={mode} setMode={setMode} existingCount={existingCount} />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button
                onClick={doImport}
                disabled={unresolved.length > 0}
                title={
                  unresolved.length > 0
                    ? `${unresolved.length} row(s) still need an answer`
                    : undefined
                }
              >
                {unresolved.length > 0
                  ? `${unresolved.length} left to answer`
                  : `Import ${rows.length} ${rows.length === 1 ? "line" : "lines"}`}
              </Button>
            </div>
          </div>
        )
      }
    >
      {step === "upload" ? (
        <UploadStep
          busy={busy}
          error={error}
          dragging={dragging}
          setDragging={setDragging}
          inputRef={inputRef}
          onPick={onPick}
          onDrop={(f) => void ingest(f)}
        />
      ) : (
        <ReviewStep
          rows={rows}
          lang={lang}
          currency={currency}
          total={total}
          declaredTotal={parsed?.declaredTotal ?? null}
          drift={drift}
          unresolved={unresolved.length}
          skipped={parsed?.skipped ?? []}
          patch={patch}
          remove={(id) => setRows((prev) => prev.filter((r) => r.id !== id))}
        />
      )}
    </Modal>
  );
}

// ------------------------------------------------------------
// Step 1 — the file
// ------------------------------------------------------------

function UploadStep({
  busy,
  error,
  dragging,
  setDragging,
  inputRef,
  onPick,
  onDrop,
}: {
  busy: boolean;
  error: string | null;
  dragging: boolean;
  setDragging: (v: boolean) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (file: File) => void;
}) {
  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onDrop(file);
        }}
        className={cn(
          "rounded-card border border-dashed p-10 text-center cursor-pointer transition-colors",
          dragging
            ? "border-[var(--accent-blue)] bg-[var(--active-tint)]"
            : "border-[var(--border-default)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-surface-hover)]"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={onPick}
        />
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full grid place-items-center bg-[var(--bg-surface-hover)] text-[var(--text-secondary)]">
            {busy ? (
              <span className="w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
            ) : (
              <Upload size={20} />
            )}
          </div>
          <div className="text-sm font-medium">
            {busy ? "Reading the file…" : "Drop a budget file, or click to choose"}
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            PDF, CSV, TSV or TXT · Arabic and English top sheets both read
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-button border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] p-3 text-sm text-[var(--color-danger)]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-button bg-[var(--bg-surface-hover)] p-3 text-xs text-[var(--text-secondary)] leading-relaxed">
        <div className="font-medium text-[var(--text-primary)] mb-1">What happens next</div>
        Every row is read out of the file and matched to a top-sheet section. Anything
        that can&apos;t be matched — an unfamiliar line item, a row with no amount —
        is listed for you to answer before anything is written. Account codes,
        head counts and the file&apos;s own total are all kept.
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Step 2 — the review
// ------------------------------------------------------------

function ReviewStep({
  rows,
  lang,
  currency,
  total,
  declaredTotal,
  drift,
  unresolved,
  skipped,
  patch,
  remove,
}: {
  rows: ParsedBudgetRow[];
  lang: "ar" | "en";
  currency: string;
  total: number;
  declaredTotal: number | null;
  drift: number | null;
  unresolved: number;
  skipped: string[];
  patch: (id: string, next: Partial<ParsedBudgetRow>) => void;
  remove: (id: string) => void;
}) {
  const [showSkipped, setShowSkipped] = useState(false);

  return (
    <div className="space-y-4">
      {/* Headline: what we read, and whether it adds up to what the file claims. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryTile label="Rows read" value={String(rows.length)} />
        <SummaryTile label="Parsed total" value={formatCurrency(total, currency)} />
        <SummaryTile
          label="File's own total"
          value={declaredTotal != null ? formatCurrency(declaredTotal, currency) : "—"}
          note={
            drift == null
              ? undefined
              : drift === 0
                ? "reconciles"
                : `off by ${formatCurrency(Math.abs(drift), currency)}`
          }
          tone={drift == null ? "muted" : drift === 0 ? "success" : "warning"}
        />
      </div>

      {/* The file's arithmetic is the file's business — this is a heads-up, not
          a blocker. A top sheet whose rows don't sum to its stated total is
          common and usually means a row was added after the total was typed. */}
      {drift != null && drift !== 0 && (
        <div className="flex items-start gap-2 rounded-button border border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.08)] p-3 text-sm text-[var(--color-warning)]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            The rows add up to {formatCurrency(total, currency)}, but the file states{" "}
            {formatCurrency(declaredTotal as number, currency)}. Worth a look before you
            import — the difference is usually a row left out of the file&apos;s own sum.
          </span>
        </div>
      )}

      {unresolved > 0 ? (
        <div className="flex items-start gap-2 rounded-button border border-[rgba(139,92,246,0.3)] bg-[rgba(139,92,246,0.08)] p-3 text-sm text-[var(--color-ai)]">
          <HelpCircle size={16} className="mt-0.5 shrink-0" />
          <span>
            <strong>{unresolved}</strong> {unresolved === 1 ? "row needs" : "rows need"} your
            input — highlighted below. Tell us which section each belongs to, or what it
            costs. Remove any that aren&apos;t budget lines at all.
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-button border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] p-3 text-sm text-[var(--color-success)]">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>Every row has a section and an amount. Ready to import.</span>
        </div>
      )}

      <div className="overflow-x-auto max-h-[46vh] overflow-y-auto rounded-card border border-[var(--border-default)]">
        <table className="pos-table">
          <thead>
            <tr>
              <th className="w-[70px]">Code</th>
              <th className="min-w-[260px]">Description</th>
              <th className="w-[60px] text-right">Qty</th>
              <th className="w-[130px] text-right">Amount</th>
              <th className="w-[190px]">Section</th>
              <th className="w-[44px]" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <ReviewRow
                key={r.id}
                row={r}
                lang={lang}
                currency={currency}
                patch={patch}
                remove={remove}
              />
            ))}
          </tbody>
        </table>
      </div>

      {skipped.length > 0 && (
        <div className="text-xs">
          <button
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2"
            onClick={() => setShowSkipped((v) => !v)}
          >
            {showSkipped ? "Hide" : "Show"} {skipped.length} skipped{" "}
            {skipped.length === 1 ? "line" : "lines"} (titles, headers, page numbers)
          </button>
          {showSkipped && (
            <div className="mt-2 rounded-button bg-[var(--bg-surface-hover)] p-3 space-y-1 font-mono text-[11px] text-[var(--text-muted)] max-h-32 overflow-y-auto">
              {skipped.map((s, i) => (
                <div key={i} dir="auto">
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewRow({
  row,
  lang,
  currency,
  patch,
  remove,
}: {
  row: ParsedBudgetRow;
  lang: "ar" | "en";
  currency: string;
  patch: (id: string, next: Partial<ParsedBudgetRow>) => void;
  remove: (id: string) => void;
}) {
  const needsSection = !row.section;
  const needsAmount = row.amount === null;
  const needsAnything = needsSection || needsAmount;

  return (
    <motion.tr
      initial={false}
      animate={{ opacity: 1 }}
      style={
        needsAnything
          ? { background: "rgba(139,92,246,0.06)", boxShadow: "inset 2px 0 0 var(--color-ai)" }
          : undefined
      }
    >
      <td className="font-mono text-xs text-[var(--text-muted)]">{row.code || "—"}</td>
      <td>
        <input
          dir="auto"
          value={row.description}
          onChange={(e) => patch(row.id, { description: e.target.value })}
          className="w-full bg-transparent border-0 px-0 py-0 text-sm focus:outline-none focus:ring-0"
        />
        {/* The source line, so the user can check the parse rather than trust it. */}
        {row.raw !== row.description && (
          <div dir="auto" className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
            {row.raw}
          </div>
        )}
      </td>
      <td className="text-right text-xs text-[var(--text-secondary)]">
        {row.qty ? `×${row.qty}` : "—"}
      </td>
      <td className="text-right">
        <input
          inputMode="decimal"
          value={row.amount ?? ""}
          placeholder={needsAmount ? "How much?" : ""}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d.]/g, "");
            patch(row.id, { amount: v === "" ? null : Number(v) });
          }}
          className={cn(
            "w-full bg-transparent border rounded-button px-2 py-1 text-sm text-right",
            needsAmount
              ? "border-[var(--color-ai)] placeholder:text-[var(--color-ai)] placeholder:text-xs"
              : "border-transparent hover:border-[var(--border-default)]"
          )}
        />
        {!needsAmount && (
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
            {formatCurrency(row.amount as number, currency)}
          </div>
        )}
      </td>
      <td>
        <select
          value={row.section ?? ""}
          onChange={(e) =>
            patch(row.id, { section: e.target.value || null, guessed: false })
          }
          className={cn(
            "w-full text-sm rounded-button",
            needsSection && "border-[var(--color-ai)] text-[var(--color-ai)]"
          )}
        >
          <option value="">Which section?</option>
          {BUDGET_SECTIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {lang === "ar" ? s.ar : s.en}
            </option>
          ))}
        </select>
        {row.section && row.guessed && (
          <div className="mt-1">
            <Badge tone="muted">matched from “{shortHint(row.description)}”</Badge>
          </div>
        )}
      </td>
      <td>
        <button
          onClick={() => remove(row.id)}
          title="Not a budget line — drop it"
          className="p-1.5 rounded-button text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--bg-surface-hover)]"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </motion.tr>
  );
}

/** First few words of a description, for the "why did it land here" chip. */
function shortHint(description: string): string {
  const words = description.trim().split(/\s+/).slice(0, 3).join(" ");
  return words.length > 28 ? `${words.slice(0, 28)}…` : words;
}

function SummaryTile({
  label,
  value,
  note,
  tone = "muted",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "muted" | "success" | "warning";
}) {
  const toneColor =
    tone === "success"
      ? "var(--color-success)"
      : tone === "warning"
        ? "var(--color-warning)"
        : "var(--text-muted)";
  return (
    <div className="rounded-card border border-[var(--border-default)] p-3">
      <div className="section-header">{label}</div>
      <div className="text-lg font-semibold mt-1 tabular-nums">{value}</div>
      {note && (
        <div className="text-xs mt-0.5" style={{ color: toneColor }}>
          {note}
        </div>
      )}
    </div>
  );
}

function ModeToggle({
  mode,
  setMode,
  existingCount,
}: {
  mode: "replace" | "append";
  setMode: (m: "replace" | "append") => void;
  existingCount: number;
}) {
  if (existingCount === 0) {
    return (
      <span className="text-xs text-[var(--text-muted)]">
        The top sheet is empty — these lines will start it.
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-[var(--text-muted)]">
        {existingCount} existing {existingCount === 1 ? "line" : "lines"}:
      </span>
      <div className="inline-flex rounded-button border border-[var(--border-default)] overflow-hidden">
        {(["replace", "append"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "px-3 h-7 capitalize transition-colors",
              mode === m
                ? "bg-[var(--active-tint)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
            )}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The button that opens this modal, for the Budget page header. */
export function BudgetImportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="secondary" leftIcon={<FileSpreadsheet size={14} />} onClick={onClick}>
      Import budget file
    </Button>
  );
}
