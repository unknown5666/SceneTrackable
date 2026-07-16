import React from "react";
import { useNavigate } from "react-router-dom";
import {
  FolderKanban,
  Upload,
  Sparkles,
  Film,
  Users,
  KeyRound,
  ArrowRight,
  GraduationCap,
} from "lucide-react";
import { useStore, isCurrentAdmin } from "@/state/store";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const STEPS = [
  {
    icon: <FolderKanban size={18} />,
    title: "Create a project",
    body: "Every production is its own project. Go to Projects → New project, name it, and pick a budget currency.",
    to: "/projects",
    cta: "Open Projects",
  },
  {
    icon: <Upload size={18} />,
    title: "Upload your script",
    body: "On a project card, click Upload script. Drop in a PDF screenplay or paste the text. SceneTrackable detects every scene heading (INT./EXT.).",
    to: "/projects",
    cta: "Upload a script",
  },
  {
    icon: <Sparkles size={18} />,
    title: "Run the AI breakdown",
    body: "Confirm the detected scenes, then Run breakdown. Each scene is analyzed for cast, extras, props, wardrobe, SFX, VFX, vehicles, animals, locations and production requirements — with day/night, category, sub-category and description.",
  },
  {
    icon: <Film size={18} />,
    title: "Refine everything",
    body: "Open the Breakdown workspace. Every field is editable — rename elements, change categories, edit descriptions and notes, or re-analyze any scene. Schedule, tasks and department pages read from the same data.",
    to: "/breakdown",
    cta: "Open Breakdown",
  },
];

const ADMIN_STEPS = [
  {
    icon: <Users size={18} />,
    title: "Manage users & roles",
    body: "Admins can add or remove users, create custom roles, and control exactly which pages each role can access — all from the Admin console.",
    to: "/admin",
    cta: "Open Admin",
  },
  {
    icon: <KeyRound size={18} />,
    title: "Connect AI (optional)",
    body: "Paste an Anthropic API key in AI Settings for live analysis. Without a key, SceneTrackable runs an intelligent demo breakdown so you can explore everything.",
    to: "/ai",
    cta: "Open AI Settings",
  },
];

export function Tutorial() {
  const nav = useNavigate();
  const admin = useStore(isCurrentAdmin);

  return (
    <div className="max-w-[900px] mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <GraduationCap size={18} className="text-[var(--accent-blue)]" />
        <div>
          <div className="section-header">Getting started</div>
          <div className="page-title">How SceneTrackable works</div>
        </div>
      </div>

      <Card variant="ai" className="mb-6">
        <div className="flex items-start gap-3">
          <Sparkles size={20} className="text-[var(--color-ai)] mt-0.5 shrink-0" />
          <div>
            <div className="font-medium text-[var(--text-primary)]">The one thing to know</div>
            <div className="text-sm text-[var(--text-secondary)] mt-1">
              Upload a script and SceneTrackable produces the entire breakdown for you. Everything else —
              schedule, budget, departments — flows from that.
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {STEPS.map((s, i) => (
          <Card key={i} className="flex items-start gap-4">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--accent-blue)] shrink-0"
              style={{ background: "var(--active-tint)" }}
            >
              {s.icon}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-[var(--text-muted)]">STEP {i + 1}</span>
                <span className="font-medium text-[var(--text-primary)]">{s.title}</span>
              </div>
              <div className="text-sm text-[var(--text-secondary)] mt-1">{s.body}</div>
            </div>
            {s.to && (
              <Button variant="secondary" size="sm" onClick={() => nav(s.to!)} className="shrink-0">
                {s.cta} <ArrowRight size={12} />
              </Button>
            )}
          </Card>
        ))}
      </div>

      {admin && (
        <>
          <div className="flex items-center gap-2 mt-8 mb-3">
            <Badge tone="ai">Admin only</Badge>
            <span className="text-sm text-[var(--text-secondary)]">Extra controls for administrators</span>
          </div>
          <div className="space-y-3">
            {ADMIN_STEPS.map((s, i) => (
              <Card key={i} className="flex items-start gap-4">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--color-ai)] shrink-0"
                  style={{ background: "rgba(139,92,246,0.1)" }}
                >
                  {s.icon}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-[var(--text-primary)]">{s.title}</div>
                  <div className="text-sm text-[var(--text-secondary)] mt-1">{s.body}</div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => nav(s.to)} className="shrink-0">
                  {s.cta} <ArrowRight size={12} />
                </Button>
              </Card>
            ))}
          </div>
        </>
      )}

      <div className="mt-8 flex justify-center">
        <Button onClick={() => nav("/projects")}>
          Start with a project <ArrowRight size={14} />
        </Button>
      </div>
    </div>
  );
}
