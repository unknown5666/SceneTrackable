import React, { useMemo, useRef, useState } from "react";
import { Receipt, Upload, Sparkles, Loader2, Check, X, AlertTriangle } from "lucide-react";
import { useStore, currentUser, currentRole, canWrite } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { HelpButton } from "@/components/ui/HelpButton";
import { DEPARTMENTS } from "@/data/schemas";
import { recognizeInvoiceText, fileToDataUrl } from "@/lib/ocr";
import { aiParseInvoice, isAllowanceExhausted } from "@/lib/claude";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { pushToast } from "@/lib/toast";
import type { DepartmentId, Invoice, InvoiceLineItem } from "@/types";

const STATUS_TONE: Record<Invoice["status"], "muted" | "info" | "warning" | "success" | "danger"> = {
  uploaded: "muted",
  processing: "info",
  parsed: "warning",
  reconciled: "success",
  error: "danger",
};

export function InvoicePortal() {
  const invoices = useStore((s) => s.invoices);
  const production = useStore((s) => s.production);
  const uploadInvoice = useStore((s) => s.uploadInvoice);
  const updateInvoiceParse = useStore((s) => s.updateInvoiceParse);
  const user = useStore(currentUser);
  const role = useStore(currentRole);
  const canManage = useStore((s) => canWrite(s, "invoices"));

  const lockedDept = role?.department;
  const [department, setDepartment] = useState<DepartmentId>(lockedDept ?? "production");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const mine = useMemo(
    () =>
      [...invoices]
        .filter((inv) => (lockedDept ? inv.department === lockedDept : true))
        .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1)),
    [invoices, lockedDept]
  );

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      uploadInvoice({
        department: lockedDept ?? department,
        uploadedBy: user?.displayName ?? "Unknown",
        fileName: file.name,
        fileDataUrl: dataUrl,
      });
      pushToast({ title: "Invoice uploaded", description: file.name, tone: "success" });
    } catch (err) {
      pushToast({
        title: "Couldn't read file",
        description: (err as Error).message,
        tone: "danger",
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="mb-6" data-tour="page-header">
        <div className="section-header flex items-center gap-1.5">
          Invoice Upload <HelpButton doc="invoices" />
        </div>
        <div className="page-title mt-1">
          {lockedDept ? `${lockedDept[0].toUpperCase()}${lockedDept.slice(1)} Buyer Portal` : "Invoice Upload"}
        </div>
        <div className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
          Upload a receipt or invoice, then run "Process Invoice with AI" to extract the vendor,
          total and line items. Nothing here is written to the budget top sheet until you reconcile
          it from the Budget page.
        </div>
      </div>

      {canManage && (
        <Card className="mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {!lockedDept && (
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value as DepartmentId)}
                className="h-9 text-sm"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button onClick={() => fileRef.current?.click()} loading={uploading}>
              <Upload size={14} /> Upload invoice / receipt
            </Button>
          </div>
        </Card>
      )}

      {mine.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Receipt size={48} />}
            title="No invoices uploaded yet"
            subtitle="Upload a photo or PDF of a receipt to get started."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {mine.map((inv) => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              currency={production.currency}
              canManage={canManage}
              onParsed={(patch) => updateInvoiceParse(inv.id, patch)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InvoiceCard({
  invoice,
  currency,
  canManage,
  onParsed,
}: {
  invoice: Invoice;
  currency: string;
  canManage: boolean;
  onParsed: (patch: Partial<Invoice>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [vendorName, setVendorName] = useState(invoice.vendorName ?? "");
  const [total, setTotal] = useState(String(invoice.parsedTotal ?? ""));
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(invoice.parsedLineItems ?? []);

  const process = async () => {
    setBusy(true);
    setLimit(false);
    onParsed({ status: "processing", parseError: undefined });
    try {
      const res = await fetch(invoice.fileDataUrl);
      const blob = await res.blob();
      const file = new File([blob], invoice.fileName, { type: blob.type });
      const ocrText = await recognizeInvoiceText(file);
      const { parsed, result } = await aiParseInvoice(ocrText, invoice.department);
      if (!parsed) throw new Error("The model didn't return a structured invoice.");
      onParsed({
        status: "parsed",
        ocrText,
        vendorName: parsed.vendorName ?? invoice.vendorName,
        parsedDate: parsed.date,
        parsedTotal: parsed.total,
        parsedLineItems: parsed.lineItems,
      });
      setVendorName(parsed.vendorName ?? invoice.vendorName ?? "");
      setTotal(String(parsed.total ?? ""));
      setLineItems(parsed.lineItems);
      void result;
    } catch (err) {
      if (isAllowanceExhausted(err)) setLimit(true);
      onParsed({ status: "error", parseError: (err as Error).message || "Processing failed" });
    } finally {
      setBusy(false);
    }
  };

  const saveEdits = () => {
    onParsed({
      vendorName: vendorName.trim() || undefined,
      parsedTotal: total.trim() ? Number(total) : undefined,
      parsedLineItems: lineItems,
    });
    setEditing(false);
  };

  return (
    <Card>
      <CardHeader
        title={invoice.vendorName || invoice.fileName}
        subtitle={`${invoice.department} · uploaded by ${invoice.uploadedBy} · ${formatDateTime(invoice.uploadedAt)}`}
        right={<Badge tone={STATUS_TONE[invoice.status]}>{invoice.status}</Badge>}
      />

      {limit && (
        <div className="flex items-start gap-2 text-xs text-[var(--color-warning)] mb-2">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          GLM free allowance exhausted — try again once it resets.
        </div>
      )}
      {invoice.status === "error" && invoice.parseError && (
        <div className="text-xs text-[var(--color-danger)] mb-2">{invoice.parseError}</div>
      )}

      {(invoice.status === "parsed" || invoice.status === "reconciled") && !editing && (
        <div className="space-y-2 mb-3">
          <div className="text-sm text-[var(--text-primary)]">
            {invoice.vendorName || "Unknown vendor"} —{" "}
            {invoice.parsedTotal !== undefined ? formatCurrency(invoice.parsedTotal, currency) : "no total"}
            {invoice.parsedDate ? ` · ${invoice.parsedDate}` : ""}
          </div>
          {invoice.parsedLineItems && invoice.parsedLineItems.length > 0 && (
            <table className="pos-table text-xs">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Unit</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.parsedLineItems.map((li, i) => (
                  <tr key={i}>
                    <td>{li.description}</td>
                    <td className="text-right">{li.quantity}</td>
                    <td className="text-right">{formatCurrency(li.unitPrice, currency)}</td>
                    <td className="text-right">{formatCurrency(li.total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {editing && (
        <div className="space-y-2 mb-3 text-sm">
          <div className="flex gap-2">
            <input
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="Vendor name"
              className="h-8 flex-1"
            />
            <input
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="Total"
              type="number"
              step="0.01"
              className="h-8 w-32"
            />
          </div>
          {lineItems.map((li, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={li.description}
                onChange={(e) =>
                  setLineItems((prev) => prev.map((p, j) => (j === i ? { ...p, description: e.target.value } : p)))
                }
                className="h-8 flex-1 text-xs"
              />
              <input
                value={li.total}
                type="number"
                step="0.01"
                onChange={(e) =>
                  setLineItems((prev) => prev.map((p, j) => (j === i ? { ...p, total: Number(e.target.value) } : p)))
                }
                className="h-8 w-24 text-xs"
              />
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div className="flex items-center gap-2">
          {invoice.status !== "reconciled" && (
            <Button variant="ai" size="sm" onClick={process} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {busy ? "Processing…" : "Process Invoice with AI"}
            </Button>
          )}
          {(invoice.status === "parsed" || invoice.status === "reconciled") &&
            (editing ? (
              <>
                <Button size="sm" onClick={saveEdits}>
                  <Check size={14} /> Save
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
                  <X size={14} /> Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
            ))}
        </div>
      )}
    </Card>
  );
}
