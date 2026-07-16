import React, { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useStore, isCurrentAdmin } from "@/state/store";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency } from "@/lib/utils";
import type { CastMember } from "@/types";

type CastForm = {
  name: string;
  role: string;
  category: CastMember["category"];
  ratePerDay: string;
  agent: string;
  contact: string;
};

const BLANK_FORM: CastForm = {
  name: "",
  role: "",
  category: "supporting",
  ratePerDay: "",
  agent: "",
  contact: "",
};

export function CastPortal() {
  const cast = useStore((s) => s.cast);
  const production = useStore((s) => s.production);
  const addCast = useStore((s) => s.addCastMember);
  const updateCast = useStore((s) => s.updateCastMember);
  const removeCast = useStore((s) => s.removeCastMember);
  const isAdmin = useStore(isCurrentAdmin);
  const activeRole = useStore((s) => s.activeRole);
  // Cast Coordinator role also gets edit rights.
  const canManage = isAdmin || activeRole === "cast" || activeRole === "scheduler";

  const [modal, setModal] = useState<null | { editingId?: string }>(null);
  const [form, setForm] = useState<CastForm>(BLANK_FORM);

  const openAdd = () => {
    setForm(BLANK_FORM);
    setModal({});
  };
  const openEdit = (c: CastMember) => {
    setForm({
      name: c.name,
      role: c.role,
      category: c.category,
      ratePerDay: String(c.ratePerDay ?? 0),
      agent: c.agent ?? "",
      contact: c.contact ?? "",
    });
    setModal({ editingId: c.id });
  };

  const save = () => {
    if (!form.name.trim() || !form.role.trim()) return;
    const payload = {
      name: form.name.trim(),
      role: form.role.trim(),
      category: form.category,
      ratePerDay: Number(form.ratePerDay) || 0,
      agent: form.agent.trim() || undefined,
      contact: form.contact.trim() || undefined,
    };
    if (modal?.editingId) {
      updateCast(modal.editingId, payload);
    } else {
      addCast({ ...payload, scenes: [] });
    }
    setModal(null);
  };

  const onDelete = (c: CastMember) => {
    if (confirm(`Remove ${c.name} from the cast?`)) removeCast(c.id);
  };

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="section-header">Cast</div>
          <div className="page-title mt-1">Cast Directory</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">
            {cast.length} member{cast.length === 1 ? "" : "s"}
          </div>
        </div>
        {canManage && (
          <Button onClick={openAdd}>
            <Plus size={14} /> Add cast
          </Button>
        )}
      </div>

      {cast.length === 0 ? (
        <EmptyState
          title="No cast yet"
          subtitle={
            canManage
              ? "Add lead, supporting, and day player roles to start building the DOOD and call sheets."
              : "The cast directory is empty. Ask a producer to add cast members."
          }
          cta={
            canManage ? (
              <Button onClick={openAdd}>
                <Plus size={14} /> Add cast
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cast.map((c) => {
            const sceneCount = c.scenes.length;
            return (
              <Card key={c.id} className="group">
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                    style={{
                      background:
                        c.category === "lead"
                          ? "var(--accent-blue)"
                          : c.category === "supporting"
                          ? "var(--color-ai)"
                          : "var(--bg-elevated)",
                      color: c.category === "day_player" ? "var(--text-primary)" : "white",
                      border:
                        c.category === "day_player"
                          ? "1px solid var(--border-default)"
                          : "none",
                    }}
                  >
                    {c.name
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          {c.name}
                        </div>
                        <div className="text-xs text-[var(--text-secondary)] truncate">
                          as <span className="font-medium">{c.role}</span>
                        </div>
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            onClick={() => openEdit(c)}
                            title="Edit"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--color-danger)]"
                            onClick={() => onDelete(c)}
                            title="Remove"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge
                        tone={
                          c.category === "lead"
                            ? "info"
                            : c.category === "supporting"
                            ? "ai"
                            : "muted"
                        }
                      >
                        {c.category.replace("_", " ")}
                      </Badge>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {sceneCount} scenes
                      </span>
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-2">
                      {formatCurrency(c.ratePerDay, production.currency)}/day
                      {c.agent && ` · ${c.agent}`}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / edit modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.editingId ? "Edit cast member" : "Add cast member"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={!form.name.trim() || !form.role.trim()}
            >
              {modal?.editingId ? "Save" : "Add"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="section-header block mb-1.5">Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full"
                placeholder="Jane Doe"
                autoFocus
              />
            </div>
            <div>
              <label className="section-header block mb-1.5">Character *</label>
              <input
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full"
                placeholder="Detective Marlowe"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="section-header block mb-1.5">Category</label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value as CastForm["category"] })
                }
                className="w-full"
              >
                <option value="lead">Lead</option>
                <option value="supporting">Supporting</option>
                <option value="day_player">Day player</option>
              </select>
            </div>
            <div>
              <label className="section-header block mb-1.5">
                Day rate ({production.currency})
              </label>
              <input
                type="number"
                min="0"
                value={form.ratePerDay}
                onChange={(e) => setForm({ ...form, ratePerDay: e.target.value })}
                className="w-full"
                placeholder="0"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="section-header block mb-1.5">Agent</label>
              <input
                value={form.agent}
                onChange={(e) => setForm({ ...form, agent: e.target.value })}
                className="w-full"
                placeholder="Agency name"
              />
            </div>
            <div>
              <label className="section-header block mb-1.5">Contact</label>
              <input
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
                className="w-full"
                placeholder="email or phone"
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
