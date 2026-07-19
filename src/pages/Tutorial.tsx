import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search,
  ArrowRight,
  Check,
  Play,
  RotateCcw,
  BookOpen,
  Compass,
  Lightbulb,
  Clapperboard,
  Sparkles,
  Film,
  MapPin,
  Users,
  Palette,
  Camera,
  Plane,
  Radio,
  Calendar,
  Grid3x3,
  Clock,
  ListChecks,
  DollarSign,
  FileBarChart,
  Bell,
  Shield,
  Cloud,
  Settings as SettingsIcon,
} from "lucide-react";
import { useStore } from "@/state/store";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { LoadSampleButton } from "@/components/ui/LoadSampleButton";
import { HANDBOOK, getHandbookDoc, type HandbookDoc } from "@/data/handbook";
import { TOUR_STEPS } from "@/data/tour";
import { loadSampleProduction } from "@/lib/export";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ReactNode> = {
  clapperboard: <Clapperboard size={16} />,
  sparkles: <Sparkles size={16} />,
  film: <Film size={16} />,
  "map-pin": <MapPin size={16} />,
  users: <Users size={16} />,
  palette: <Palette size={16} />,
  camera: <Camera size={16} />,
  plane: <Plane size={16} />,
  radio: <Radio size={16} />,
  calendar: <Calendar size={16} />,
  grid: <Grid3x3 size={16} />,
  clock: <Clock size={16} />,
  "list-checks": <ListChecks size={16} />,
  "dollar-sign": <DollarSign size={16} />,
  "file-bar-chart": <FileBarChart size={16} />,
  bell: <Bell size={16} />,
  shield: <Shield size={16} />,
  cloud: <Cloud size={16} />,
  settings: <SettingsIcon size={16} />,
};

export function Tutorial() {
  const [params, setParams] = useSearchParams();
  const initialTab = params.get("tab") === "handbook" || params.get("doc") ? "handbook" : "tour";
  const [tab, setTab] = useState<string>(initialTab);

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="flex items-center gap-2 mb-5">
        <BookOpen size={18} className="text-[var(--accent-blue)]" />
        <div>
          <div className="section-header">Help</div>
          <div className="page-title">Tour &amp; handbook</div>
        </div>
      </div>

      <Tabs
        className="mb-6"
        active={tab}
        onChange={(id) => {
          setTab(id);
          const next = new URLSearchParams(params);
          next.set("tab", id);
          if (id !== "handbook") next.delete("doc");
          setParams(next, { replace: true });
        }}
        tabs={[
          { id: "tour", label: (<span className="flex items-center gap-2"><Compass size={14} /> Guided tour</span>) },
          { id: "handbook", label: (<span className="flex items-center gap-2"><BookOpen size={14} /> Feature handbook</span>) },
        ]}
      />

      {tab === "tour" ? <GuidedTourTab /> : <HandbookTab />}
    </div>
  );
}

// ------------------------------------------------------------
// Guided tour tab
// ------------------------------------------------------------
function GuidedTourTab() {
  const nav = useNavigate();
  const projects = useStore((s) => s.projects);
  const running = useStore((s) => s.tour.running);
  const completed = useStore((s) => s.tour.completed);
  const startTour = useStore((s) => s.startTour);
  const [loadingSample, setLoadingSample] = useState(false);

  const start = async () => {
    if (projects.length === 0) {
      // Load the sample first; on reload the app resumes the tour.
      setLoadingSample(true);
      localStorage.setItem("st-resume-tour", "1");
      const err = await loadSampleProduction();
      if (err) {
        setLoadingSample(false);
        localStorage.removeItem("st-resume-tour");
      }
      return; // success reloads the page
    }
    startTour();
    nav("/dashboard");
  };

  const doneCount = TOUR_STEPS.filter((s) => completed.includes(s.id)).length;
  const pct = Math.round((doneCount / TOUR_STEPS.length) * 100);

  return (
    <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6">
      <Card variant="ai" padding="lg" className="flex flex-col">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(139,92,246,0.14)" }}>
            <Compass size={20} className="text-[var(--color-ai)]" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[var(--text-primary)]">Take the guided tour</div>
            <div className="text-xs text-[var(--text-secondary)]">Spotlights the real UI, step by step</div>
          </div>
        </div>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mt-1">
          A hands-on walkthrough on the live app. It loads a fully dressed sample production, then
          walks the hero flow — sidebar, ⌘K, Breakdown, Schedule and Reports. Leave any time; it
          remembers where you were.
        </p>

        {doneCount > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1">
              <span>Progress</span>
              <span className="tabular-nums">{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden bg-[var(--bg-surface-hover)]">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--color-ai)" }} />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mt-5">
          <Button onClick={start} loading={loadingSample} variant="ai">
            {!loadingSample && (running ? <RotateCcw size={14} /> : <Play size={14} />)}
            {running ? "Resume tour" : doneCount > 0 ? "Restart tour" : "Start the tour"}
          </Button>
          {projects.length === 0 && !loadingSample && (
            <span className="text-[11px] text-[var(--text-muted)]">Loads the sample first</span>
          )}
        </div>
        {projects.length === 0 && (
          <div className="mt-4 pt-4 border-t border-[var(--border-default)]">
            <div className="text-xs text-[var(--text-secondary)] mb-2">Or just load the sample and explore on your own:</div>
            <LoadSampleButton size="sm" />
          </div>
        )}
      </Card>

      {/* Step checklist */}
      <Card padding="none">
        <div className="p-4 border-b border-[var(--border-default)] section-header">What the tour covers</div>
        <div className="divide-y divide-[var(--border-default)]">
          {TOUR_STEPS.map((s, i) => {
            const done = completed.includes(s.id);
            return (
              <div key={s.id} className="flex items-start gap-3 p-3">
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0",
                    done
                      ? "bg-[color-mix(in_srgb,var(--color-success)_18%,transparent)] text-[var(--color-success)]"
                      : "bg-[var(--bg-surface-hover)] text-[var(--text-muted)]"
                  )}
                >
                  {done ? <Check size={13} /> : i + 1}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--text-primary)]">{s.title}</div>
                  <div className="text-xs text-[var(--text-muted)] line-clamp-2">{s.body}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------
// Handbook tab
// ------------------------------------------------------------
function HandbookTab() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const activeId = params.get("doc") ?? HANDBOOK[0].id;
  const doc = getHandbookDoc(activeId) ?? HANDBOOK[0];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return HANDBOOK;
    return HANDBOOK.filter((d) =>
      `${d.title} ${d.summary} ${d.keywords ?? ""}`.toLowerCase().includes(q)
    );
  }, [query]);

  const select = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", "handbook");
    next.set("doc", id);
    setParams(next, { replace: true });
  };

  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-6 items-start">
      {/* TOC */}
      <Card padding="none" className="lg:sticky lg:top-20">
        <div className="p-2.5 border-b border-[var(--border-default)]">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search docs…"
              className="w-full h-8 text-xs pl-7"
            />
          </div>
        </div>
        <div className="max-h-[62vh] overflow-y-auto py-1.5">
          {filtered.length === 0 && (
            <div className="text-xs text-[var(--text-muted)] text-center py-6">No matches</div>
          )}
          {filtered.map((d) => (
            <button
              key={d.id}
              onClick={() => select(d.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm",
                d.id === activeId
                  ? "bg-[var(--active-tint)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
              )}
            >
              <span className="text-[var(--text-muted)] shrink-0">{ICONS[d.iconKey]}</span>
              <span className="truncate">{d.title}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Doc */}
      <DocView doc={doc} onGoThere={(r) => nav(r)} />
    </div>
  );
}

function DocView({ doc, onGoThere }: { doc: HandbookDoc; onGoThere: (route: string) => void }) {
  return (
    <Card padding="lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--accent-blue)] shrink-0" style={{ background: "var(--active-tint)" }}>
            {ICONS[doc.iconKey]}
          </div>
          <div>
            <div className="text-xl font-semibold text-[var(--text-primary)]">{doc.title}</div>
            <div className="text-sm text-[var(--text-secondary)]">{doc.summary}</div>
          </div>
        </div>
        {doc.route && (
          <Button size="sm" variant="secondary" className="shrink-0" onClick={() => onGoThere(doc.route!)}>
            Go there <ArrowRight size={12} />
          </Button>
        )}
      </div>

      <div className="mt-5 space-y-3">
        {doc.body.map((p, i) => (
          <p key={i} className="text-sm text-[var(--text-secondary)] leading-relaxed">{p}</p>
        ))}
      </div>

      {doc.steps && doc.steps.length > 0 && (
        <div className="mt-6">
          <div className="section-header mb-3">How to use it</div>
          <ol className="space-y-2.5">
            {doc.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-[var(--active-tint)] text-[var(--accent-blue)] text-[11px] font-semibold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="text-sm text-[var(--text-primary)] leading-relaxed pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {doc.tips && doc.tips.length > 0 && (
        <div className="mt-6 rounded-card border border-[var(--border-default)] p-4" style={{ background: "var(--bg-surface-hover)" }}>
          <div className="flex items-center gap-1.5 section-header mb-2">
            <Lightbulb size={13} className="text-[var(--color-warning)]" /> Tips
          </div>
          <ul className="space-y-1.5">
            {doc.tips.map((t, i) => (
              <li key={i} className="text-sm text-[var(--text-secondary)] flex items-start gap-2">
                <span className="text-[var(--text-muted)] mt-1.5 w-1 h-1 rounded-full bg-[var(--text-muted)] shrink-0" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
