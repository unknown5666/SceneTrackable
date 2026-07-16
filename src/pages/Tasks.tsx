import React, { useState, useMemo } from "react";
import {
  ListChecks,
  Plus,
  Filter,
  LayoutGrid,
  List,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { useStore } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
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

export function Tasks() {
  const tasks = useStore((s) => s.tasks);
  const activeRole = useStore((s) => s.activeRole);
  const currentUserId = useStore((s) => s.currentUserId);
  const crew = useStore((s) => s.crew);
  const updateTaskStatus = useStore((s) => s.updateTaskStatus);

  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [filter, setFilter] = useState<"all" | "mine" | "department">("all");
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  const isAdmin = activeRole === "admin";
  const myDept = crew.find((c) => c.id === currentUserId)?.department;

  const filteredTasks = useMemo(() => {
    switch (filter) {
      case "mine":
        return tasks.filter((t) => t.owner === currentUserId);
      case "department":
        return myDept ? tasks.filter((t) => t.department === myDept) : tasks;
      default:
        return tasks;
    }
  }, [tasks, filter, currentUserId, myDept]);

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="section-header">Tasks</div>
          <div className="page-title mt-1">Task Engine</div>
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
            {!isAdmin && <option value="department">My department</option>}
          </select>

          <Button onClick={() => setNewTaskOpen(true)}>
            <Plus size={14} /> New task
          </Button>
        </div>
      </div>

      {view === "kanban" ? (
        <KanbanView
          tasks={filteredTasks}
          crew={crew}
          onStatusChange={updateTaskStatus}
        />
      ) : (
        <ListView tasks={filteredTasks} crew={crew} />
      )}

      <NewTaskModal open={newTaskOpen} onClose={() => setNewTaskOpen(false)} />
    </div>
  );
}

function KanbanView({
  tasks,
  crew,
  onStatusChange,
}: {
  tasks: Task[];
  crew: ReturnType<typeof useStore.getState>["crew"];
  onStatusChange: (id: string, status: TaskStatus) => void;
}) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${STATUS_COLUMNS.length}, minmax(220px, 1fr))` }}>
      {STATUS_COLUMNS.map((status) => {
        const col = tasks.filter((t) => t.status === status);
        return (
          <div key={status} className="min-w-0">
            <div className="flex items-center justify-between mb-3">
              <StatusBadge status={status === "blocked" ? "blocked" : status === "not_started" ? "not_started" : status === "in_progress" ? "in_progress" : status === "review" ? "review" : "completed"} />
              <Badge tone="muted">{col.length}</Badge>
            </div>
            <div className="space-y-2">
              {col.map((task) => {
                const owner = crew.find((c) => c.id === task.owner);
                const overdue = task.status !== "completed" && isOverdue(task.computedDeadline);
                const idx = STATUS_COLUMNS.indexOf(task.status);
                const nextStatus = STATUS_COLUMNS[idx + 1];

                return (
                  <Card key={task.id} padding="sm" className="group">
                    <div className="flex items-start justify-between gap-1.5 mb-1.5">
                      <div className="text-sm font-medium text-[var(--text-primary)] line-clamp-2">
                        {task.createdByAI && (
                          <Sparkles
                            size={10}
                            className="inline mr-1 text-[var(--color-ai)]"
                          />
                        )}
                        {task.title}
                      </div>
                      <Badge tone={PRIORITY_TONE[task.priority]}>
                        {task.priority[0].toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-[var(--text-muted)]">{owner?.name}</span>
                      <span
                        className={cn(
                          overdue ? "text-[var(--color-danger)] font-medium" : "text-[var(--text-muted)]"
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
                    {nextStatus && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onStatusChange(task.id, nextStatus)}
                      >
                        → {nextStatus.replace("_", " ")}
                      </Button>
                    )}
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

function ListView({
  tasks,
  crew,
}: {
  tasks: Task[];
  crew: ReturnType<typeof useStore.getState>["crew"];
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
            </tr>
          </thead>
          <tbody>
            {sorted.map((task) => {
              const owner = crew.find((c) => c.id === task.owner);
              const overdue =
                task.status !== "completed" && isOverdue(task.computedDeadline);
              return (
                <tr key={task.id}>
                  <td>
                    <div className="flex items-center gap-1.5">
                      {task.createdByAI && (
                        <Sparkles size={10} className="text-[var(--color-ai)] shrink-0" />
                      )}
                      <span className="text-sm text-[var(--text-primary)]">{task.title}</span>
                    </div>
                  </td>
                  <td className="text-sm text-[var(--text-secondary)]">{owner?.name ?? "—"}</td>
                  <td><Badge tone="muted">{task.department}</Badge></td>
                  <td><Badge tone={PRIORITY_TONE[task.priority]}>{task.priority}</Badge></td>
                  <td className={cn("text-sm", overdue && "text-[var(--color-danger)] font-medium")}>
                    {formatDate(task.computedDeadline)}
                  </td>
                  <td className="text-xs text-[var(--text-muted)]">{humanizeRule(task.deadlineRule)}</td>
                  <td><StatusBadge status={task.status === "blocked" ? "blocked" : task.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function NewTaskModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const createTask = useStore((s) => s.createTask);
  const currentUserId = useStore((s) => s.currentUserId);
  const [title, setTitle] = useState("");
  const [dept, setDept] = useState<DepartmentId>("production");
  const [priority, setPriority] = useState<TaskPriority>("medium");

  const submit = () => {
    if (!title.trim()) return;
    createTask({
      title: title.trim(),
      owner: currentUserId,
      department: dept,
      deadlineRule: "manual(2026-07-10)",
      status: "not_started",
      priority,
    });
    setTitle("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Task"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!title.trim()}>Create</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="section-header block mb-1.5">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to happen?"
            className="w-full"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="section-header block mb-1.5">Department</label>
            <select value={dept} onChange={(e) => setDept(e.target.value as DepartmentId)} className="w-full">
              {["production", "camera", "sound", "vfx", "art", "wardrobe", "props", "accounting", "transport", "cast"].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="section-header block mb-1.5">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className="w-full">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>
      </div>
    </Modal>
  );
}
