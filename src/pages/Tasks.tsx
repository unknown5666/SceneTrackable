import React, { useState, useMemo } from "react";
import {
  Plus,
  LayoutGrid,
  List,
  Sparkles,
  AlertCircle,
  Pencil,
  Trash2,
} from "lucide-react";
import { useStore, currentUser, isCurrentAdmin } from "@/state/store";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, isOverdue, cn } from "@/lib/utils";
import { humanizeRule } from "@/lib/deadlines";
import type { Task, TaskStatus, TaskPriority, DepartmentId } from "@/types";

const STATUS_COLUMNS: TaskStatus[] = [
  "not_started",
  "in_progress",
  "review",
  "blocked",
  "completed",
];

const PRIORITY_TONE: Record<TaskPriority, "danger" | "warning" | "info" | "muted"> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "muted",
};

const DEPARTMENTS: DepartmentId[] = [
  "production",
  "camera",
  "sound",
  "vfx",
  "art",
  "wardrobe",
  "props",
  "accounting",
  "transport",
  "rf",
  "cast",
];

/** Owner display: try users first (userId), fall back to crew (legacy owner ids), else "—". */
function useOwnerLookup() {
  const users = useStore((s) => s.users);
  const crew = useStore((s) => s.crew);
  return (ownerId: string): string => {
    const u = users.find((x) => x.id === ownerId);
    if (u) return u.displayName;
    const c = crew.find((x) => x.id === ownerId);
    if (c) return c.name;
    return "Unassigned";
  };
}

export function Tasks() {
  const tasks = useStore((s) => s.tasks);
  const currentUserId = useStore((s) => s.currentUserId);
  const isAdmin = useStore(isCurrentAdmin);
  const me = useStore(currentUser);
  const users = useStore((s) => s.users);
  const updateTaskStatus = useStore((s) => s.updateTaskStatus);
  const deleteTask = useStore((s) => s.deleteTask);
  const ownerLabel = useOwnerLookup();

  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);

  const filteredTasks = useMemo(
    () =>
      filter === "mine" ? tasks.filter((t) => t.owner === currentUserId) : tasks,
    [tasks, filter, currentUserId]
  );

  const canModify = (task: Task) => isAdmin || task.owner === currentUserId;

  const onDelete = (task: Task) => {
    if (!canModify(task)) return;
    if (confirm(`Delete task “${task.title}”?`)) deleteTask(task.id);
  };

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="section-header">Tasks</div>
          <div className="page-title mt-1">Task Engine</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">
            {isAdmin
              ? "Admin — you can edit any task."
              : "You can create tasks and edit tasks assigned to you."}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-[var(--border-default)] rounded-button overflow-hidden">
            <button
              className={cn(
                "px-3 h-9 text-xs",
                view === "kanban"
                  ? "bg-[var(--active-tint)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
              )}
              onClick={() => setView("kanban")}
              aria-label="Kanban view"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              className={cn(
                "px-3 h-9 text-xs",
                view === "list"
                  ? "bg-[var(--active-tint)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
              )}
              onClick={() => setView("list")}
              aria-label="List view"
            >
              <List size={14} />
            </button>
          </div>

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="h-9 text-xs"
          >
            <option value="all">All tasks</option>
            <option value="mine">My tasks</option>
          </select>

          <Button onClick={() => setNewTaskOpen(true)} disabled={!me}>
            <Plus size={14} /> New task
          </Button>
        </div>
      </div>

      {tasks.length === 0 && (
        <EmptyState
          title="No tasks yet"
          subtitle="Create your first task. Every task needs an owner and a deadline."
          cta={
            <Button onClick={() => setNewTaskOpen(true)}>
              <Plus size={14} /> New task
            </Button>
          }
        />
      )}

      {tasks.length > 0 &&
        (view === "kanban" ? (
          <KanbanView
            tasks={filteredTasks}
            ownerLabel={ownerLabel}
            canModify={canModify}
            onStatusChange={updateTaskStatus}
            onEdit={setEditTask}
            onDelete={onDelete}
          />
        ) : (
          <ListView
            tasks={filteredTasks}
            ownerLabel={ownerLabel}
            canModify={canModify}
            onEdit={setEditTask}
            onDelete={onDelete}
          />
        ))}

      <TaskModal
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        mode="create"
        users={users}
      />
      <TaskModal
        open={!!editTask}
        onClose={() => setEditTask(null)}
        mode="edit"
        task={editTask ?? undefined}
        users={users}
        canEdit={editTask ? canModify(editTask) : false}
      />
    </div>
  );
}

// ============================================================
// Kanban
// ============================================================

function KanbanView({
  tasks,
  ownerLabel,
  canModify,
  onStatusChange,
  onEdit,
  onDelete,
}: {
  tasks: Task[];
  ownerLabel: (id: string) => string;
  canModify: (t: Task) => boolean;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${STATUS_COLUMNS.length}, minmax(220px, 1fr))` }}
    >
      {STATUS_COLUMNS.map((status) => {
        const col = tasks.filter((t) => t.status === status);
        return (
          <div key={status} className="min-w-0">
            <div className="flex items-center justify-between mb-3">
              <StatusBadge status={status} />
              <Badge tone="muted">{col.length}</Badge>
            </div>
            <div className="space-y-2">
              {col.map((task) => {
                const overdue = task.status !== "completed" && isOverdue(task.computedDeadline);
                const idx = STATUS_COLUMNS.indexOf(task.status);
                const nextStatus = STATUS_COLUMNS[idx + 1];
                const editable = canModify(task);
                return (
                  <Card key={task.id} padding="sm" className="group">
                    <div className="flex items-start justify-between gap-1.5 mb-1.5">
                      <div className="text-sm font-medium text-[var(--text-primary)] line-clamp-2">
                        {task.createdByAI && (
                          <Sparkles size={10} className="inline mr-1 text-[var(--color-ai)]" />
                        )}
                        {task.title}
                      </div>
                      <Badge tone={PRIORITY_TONE[task.priority]}>
                        {task.priority[0].toUpperCase()}
                      </Badge>
                    </div>
                    {task.description && (
                      <div className="text-[11px] text-[var(--text-secondary)] line-clamp-2 mb-1.5">
                        {task.description}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-[var(--text-muted)]">{ownerLabel(task.owner)}</span>
                      <span
                        className={cn(
                          overdue
                            ? "text-[var(--color-danger)] font-medium"
                            : "text-[var(--text-muted)]"
                        )}
                      >
                        {formatDate(task.computedDeadline)}
                      </span>
                    </div>
                    {task.blockedBy && task.blockedBy.length > 0 && (
                      <div className="mt-1.5 text-[10px] text-[var(--color-danger)] flex items-center gap-1">
                        <AlertCircle size={10} />
                        Blocked
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {nextStatus && editable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1"
                          onClick={() => onStatusChange(task.id, nextStatus)}
                        >
                          → {nextStatus.replace("_", " ")}
                        </Button>
                      )}
                      {editable && (
                        <>
                          <button
                            className="p-1 rounded hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            onClick={() => onEdit(task)}
                            title="Edit task"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            className="p-1 rounded hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--color-danger)]"
                            onClick={() => onDelete(task)}
                            title="Delete task"
                          >
                            <Trash2 size={11} />
                          </button>
                        </>
                      )}
                    </div>
                  </Card>
                );
              })}
              {col.length === 0 && (
                <div className="text-center text-[10px] text-[var(--text-muted)] py-8">
                  No tasks
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// List
// ============================================================

function ListView({
  tasks,
  ownerLabel,
  canModify,
  onEdit,
  onDelete,
}: {
  tasks: Task[];
  ownerLabel: (id: string) => string;
  canModify: (t: Task) => boolean;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  const sorted = useMemo(
    () =>
      [...tasks].sort(
        (a, b) =>
          new Date(a.computedDeadline).getTime() - new Date(b.computedDeadline).getTime()
      ),
    [tasks]
  );

  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="pos-table">
          <thead>
            <tr>
              <th className="min-w-[280px]">Task</th>
              <th>Owner</th>
              <th>Dept</th>
              <th>Priority</th>
              <th>Deadline</th>
              <th>Rule</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((task) => {
              const overdue =
                task.status !== "completed" && isOverdue(task.computedDeadline);
              const editable = canModify(task);
              return (
                <tr key={task.id}>
                  <td>
                    <div className="flex items-center gap-1.5">
                      {task.createdByAI && (
                        <Sparkles size={10} className="text-[var(--color-ai)] shrink-0" />
                      )}
                      <span className="text-sm text-[var(--text-primary)]">{task.title}</span>
                    </div>
                    {task.description && (
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-1">
                        {task.description}
                      </div>
                    )}
                  </td>
                  <td className="text-sm text-[var(--text-secondary)]">{ownerLabel(task.owner)}</td>
                  <td><Badge tone="muted">{task.department}</Badge></td>
                  <td><Badge tone={PRIORITY_TONE[task.priority]}>{task.priority}</Badge></td>
                  <td
                    className={cn(
                      "text-sm",
                      overdue && "text-[var(--color-danger)] font-medium"
                    )}
                  >
                    {formatDate(task.computedDeadline)}
                  </td>
                  <td className="text-xs text-[var(--text-muted)]">
                    {humanizeRule(task.deadlineRule)}
                  </td>
                  <td>
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30"
                        onClick={() => onEdit(task)}
                        disabled={!editable}
                        title={editable ? "Edit" : "Only the owner or an admin can edit"}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--color-danger)] disabled:opacity-30"
                        onClick={() => onDelete(task)}
                        disabled={!editable}
                        title={editable ? "Delete" : "Only the owner or an admin can delete"}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ============================================================
// Task modal (create + edit)
// ============================================================

function TaskModal({
  open,
  onClose,
  mode,
  task,
  users,
  canEdit,
}: {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  task?: Task;
  users: ReturnType<typeof useStore.getState>["users"];
  canEdit?: boolean;
}) {
  const createTask = useStore((s) => s.createTask);
  const updateTask = useStore((s) => s.updateTask);
  const me = useStore(currentUser);
  const isAdmin = useStore(isCurrentAdmin);

  const activeUsers = useMemo(() => users.filter((u) => u.active), [users]);

  const today = new Date();
  const defaultDeadline = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [dept, setDept] = useState<DepartmentId>("production");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [status, setStatus] = useState<TaskStatus>("not_started");
  const [deadline, setDeadline] = useState(defaultDeadline);

  React.useEffect(() => {
    if (!open) return;
    if (mode === "edit" && task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setOwner(task.owner);
      setDept(task.department);
      setPriority(task.priority);
      setStatus(task.status);
      // Parse manual(YYYY-MM-DD) back to date string, else use computedDeadline.
      const m = task.deadlineRule.match(/^manual\((\d{4}-\d{2}-\d{2})\)/);
      setDeadline(m ? m[1] : task.computedDeadline.slice(0, 10));
    } else {
      setTitle("");
      setDescription("");
      setOwner(me?.id ?? "");
      setDept("production");
      setPriority("medium");
      setStatus("not_started");
      setDeadline(defaultDeadline);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, mode]);

  const disabled = !title.trim() || !owner || !deadline;
  const readOnly = mode === "edit" && !canEdit;

  const submit = () => {
    if (disabled || readOnly) return;
    const rule = `manual(${deadline})`;
    if (mode === "create") {
      createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        owner,
        department: dept,
        deadlineRule: rule,
        status,
        priority,
      });
    } else if (task) {
      updateTask(task.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        owner,
        department: dept,
        deadlineRule: rule,
        computedDeadline: new Date(deadline + "T09:00:00.000Z").toISOString(),
        status,
        priority,
      });
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "create" ? "New Task" : readOnly ? "View Task" : "Edit Task"}
      subtitle={
        readOnly
          ? "You can only edit tasks assigned to you (admins bypass this)."
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {readOnly ? "Close" : "Cancel"}
          </Button>
          {!readOnly && (
            <Button onClick={submit} disabled={disabled}>
              {mode === "create" ? "Create" : "Save"}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="section-header block mb-1.5">Title *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to happen?"
            className="w-full"
            autoFocus
            disabled={readOnly}
          />
        </div>
        <div>
          <label className="section-header block mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional detail, links, or notes"
            className="w-full min-h-[70px]"
            disabled={readOnly}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="section-header block mb-1.5">Owner *</label>
            <select
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="w-full"
              disabled={readOnly || (!isAdmin && mode === "edit")}
            >
              <option value="">— Select owner —</option>
              {activeUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
            {!isAdmin && mode === "create" && (
              <div className="text-[10px] text-[var(--text-muted)] mt-1">
                Contributors can create tasks; only admins can reassign after creation.
              </div>
            )}
          </div>
          <div>
            <label className="section-header block mb-1.5">Deadline *</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full"
              disabled={readOnly}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="section-header block mb-1.5">Department</label>
            <select
              value={dept}
              onChange={(e) => setDept(e.target.value as DepartmentId)}
              className="w-full"
              disabled={readOnly}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="section-header block mb-1.5">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="w-full"
              disabled={readOnly}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="section-header block mb-1.5">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="w-full"
              disabled={readOnly}
            >
              {STATUS_COLUMNS.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </Modal>
  );
}
