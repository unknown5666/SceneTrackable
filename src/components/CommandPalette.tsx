import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Search,
  CornerDownLeft,
  Film,
  MapPin,
  Users,
  Package,
  FileDown,
  Printer,
  Sparkles,
  Home,
  Calendar,
  ListChecks,
  DollarSign,
  FileBarChart,
  Clapperboard,
  Moon,
  Sun,
  LogOut,
  BookOpen,
} from "lucide-react";
import { useStore } from "@/state/store";
import { useTheme } from "@/state/theme";
import { CATEGORY_META } from "@/lib/breakdownVisuals";
import { exportBreakdownCSV, printBreakdownSheets } from "@/lib/export";
import { HANDBOOK } from "@/data/handbook";
import { backdropVariants, menuVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
  icon?: React.ReactNode;
  keywords?: string;
  run: () => void;
}

// ------------------------------------------------------------
// Lightweight fuzzy scoring: subsequence match with bonuses for
// consecutive hits and word-boundary starts. Returns -1 for no match.
// ------------------------------------------------------------
function fuzzyScore(query: string, target: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let score = 0;
  let ti = 0;
  let consecutive = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    const found = t.indexOf(ch, ti);
    if (found === -1) return -1;
    let bonus = 1;
    if (found === ti) bonus += consecutive * 2; // consecutive run
    if (found === 0 || /[\s\-_/·—]/.test(t[found - 1])) bonus += 3; // word start
    score += bonus;
    consecutive = found === ti ? consecutive + 1 : 0;
    ti = found + 1;
  }
  // Prefer shorter targets and earlier matches.
  return score - t.length * 0.05;
}

/** Global ⌘K / Ctrl-K palette. Mounted once in the authenticated layout. */
export function CommandPalette() {
  const nav = useNavigate();
  const { theme, toggle } = useTheme();
  const reduce = useReducedMotion();

  const scenes = useStore((s) => s.scenes);
  const cast = useStore((s) => s.cast);
  const characterBible = useStore((s) => s.characterBible);
  const locations = useStore((s) => s.locations);
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const logout = useStore((s) => s.logout);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Global open shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // Focus after the enter animation begins.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const close = () => setOpen(false);
  const go = (route: string) => {
    nav(route);
    close();
  };

  const items: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [];

    // ---- Pages ----
    const pages: [string, string, React.ReactNode][] = [
      ["/dashboard", "Dashboard", <Home size={15} />],
      ["/projects", "Projects", <Clapperboard size={15} />],
      ["/breakdown", "Script Breakdown", <Film size={15} />],
      ["/schedule", "Schedule", <Calendar size={15} />],
      ["/locations", "Locations", <MapPin size={15} />],
      ["/cast", "Cast", <Users size={15} />],
      ["/tasks", "Tasks", <ListChecks size={15} />],
      ["/budget", "Budget", <DollarSign size={15} />],
      ["/reports", "Reports", <FileBarChart size={15} />],
      ["/tutorial", "Help & tutorial", <BookOpen size={15} />],
    ];
    for (const [route, title, icon] of pages) {
      list.push({
        id: `page:${route}`,
        title,
        group: "Pages",
        subtitle: "Go to page",
        icon,
        keywords: "navigate open go to " + title,
        run: () => go(route),
      });
    }

    // ---- Scenes ----
    for (const s of scenes) {
      list.push({
        id: `scene:${s.id}`,
        title: `Scene ${s.number} — ${s.location}`,
        subtitle: `${s.intExt} · ${s.timeOfDay} · ${s.elements.length} elements`,
        group: "Scenes",
        icon: <Film size={15} />,
        keywords: `${s.number} ${s.location} ${s.intExt} ${s.timeOfDay} ${s.synopsis ?? ""}`,
        run: () => go(`/breakdown?scene=${s.id}`),
      });
      list.push({
        id: `rerun:${s.id}`,
        title: `Re-run breakdown — Scene ${s.number}`,
        subtitle: "AI re-analyze this scene",
        group: "Actions",
        icon: <Sparkles size={15} />,
        keywords: `rerun re-run reanalyze analyze scene ${s.number} ${s.location} ai`,
        run: () => go(`/breakdown?scene=${s.id}&action=rerun`),
      });
    }

    // ---- Characters / cast ----
    const seen = new Set<string>();
    for (const c of cast) {
      seen.add(c.role.toLowerCase());
      list.push({
        id: `cast:${c.id}`,
        title: c.role,
        subtitle: `${c.name} · ${c.category.replace("_", " ")}`,
        group: "Cast",
        icon: <Users size={15} />,
        keywords: `character role cast ${c.role} ${c.name}`,
        run: () => go("/cast"),
      });
    }
    for (const c of characterBible) {
      if (seen.has(c.name.toLowerCase())) continue;
      list.push({
        id: `char:${c.name}`,
        title: c.name,
        subtitle: `Character · ${c.importance}`,
        group: "Cast",
        icon: <Users size={15} />,
        keywords: `character ${c.name} ${(c.aliases ?? []).join(" ")}`,
        run: () => go("/cast"),
      });
    }

    // ---- Locations ----
    for (const l of locations) {
      list.push({
        id: `loc:${l.id}`,
        title: l.name,
        subtitle: `Location · ${l.type} · ${l.permitStatus.replace("_", " ")}`,
        group: "Locations",
        icon: <MapPin size={15} />,
        keywords: `location ${l.name} ${l.type} ${(l.aliases ?? []).join(" ")}`,
        run: () => go("/locations"),
      });
    }

    // ---- Props / elements (deduped by name) ----
    const propSeen = new Map<string, string>(); // name -> sceneId
    for (const s of scenes) {
      for (const e of s.elements) {
        if (e.category === "cast") continue;
        const key = e.name.toLowerCase();
        if (propSeen.has(key)) continue;
        propSeen.set(key, s.id);
        list.push({
          id: `el:${e.id}`,
          title: e.name,
          subtitle: `${CATEGORY_META[e.category]?.label ?? e.category} · Scene ${s.number}`,
          group: "Elements",
          icon: (
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: CATEGORY_META[e.category]?.color ?? "var(--text-muted)" }}
            />
          ),
          keywords: `${e.category} ${e.name} ${e.subCategory ?? ""} element prop`,
          run: () => go(`/breakdown?scene=${s.id}`),
        });
      }
    }

    // ---- Global actions ----
    list.push({
      id: "act:export-csv",
      title: "Export breakdown (CSV)",
      subtitle: "Download all scenes & elements",
      group: "Actions",
      icon: <FileDown size={15} />,
      keywords: "export csv download breakdown spreadsheet",
      run: () => {
        if (project) exportBreakdownCSV(project.name, scenes);
        close();
      },
    });
    list.push({
      id: "act:print-sheets",
      title: "Print breakdown sheets",
      subtitle: "Industry-style paperwork",
      group: "Actions",
      icon: <Printer size={15} />,
      keywords: "print breakdown sheets pdf paper",
      run: () => {
        if (project) printBreakdownSheets(project.name, scenes);
        close();
      },
    });
    list.push({
      id: "act:export-dood",
      title: "Export DOOD",
      subtitle: "Day Out of Days report",
      group: "Actions",
      icon: <FileDown size={15} />,
      keywords: "dood day out of days export report cast",
      run: () => go("/reports"),
    });
    list.push({
      id: "act:theme",
      title: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
      group: "Actions",
      icon: theme === "dark" ? <Sun size={15} /> : <Moon size={15} />,
      keywords: "theme dark light appearance toggle",
      run: () => {
        toggle();
        close();
      },
    });
    list.push({
      id: "act:signout",
      title: "Sign out",
      group: "Actions",
      icon: <LogOut size={15} />,
      keywords: "sign out logout leave",
      run: () => {
        logout();
        nav("/login", { replace: true });
        close();
      },
    });

    // ---- Handbook entries (also searchable here, per #4) ----
    for (const doc of HANDBOOK) {
      list.push({
        id: `doc:${doc.id}`,
        title: doc.title,
        subtitle: "Help · " + doc.summary,
        group: "Help",
        icon: <BookOpen size={15} />,
        keywords: `help docs handbook ${doc.title} ${doc.summary} ${doc.keywords ?? ""}`,
        run: () => go(`/tutorial?doc=${doc.id}`),
      });
    }

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes, cast, characterBible, locations, project, theme]);

  const results = useMemo(() => {
    if (!query.trim()) {
      // A useful resting state: pages first, then a few scenes.
      return items.filter((i) => i.group === "Pages").concat(
        items.filter((i) => i.group === "Scenes").slice(0, 5)
      );
    }
    const scored = items
      .map((item) => {
        const hay = `${item.title} ${item.keywords ?? ""}`;
        const s = Math.max(fuzzyScore(query, item.title) + 4, fuzzyScore(query, hay));
        return { item, s };
      })
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40);
    return scored.map((r) => r.item);
  }, [items, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // Keep the active row in view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[active]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  // Group results for section headers while preserving order.
  const grouped = useMemo(() => {
    const out: { group: string; items: { item: CommandItem; idx: number }[] }[] = [];
    results.forEach((item, idx) => {
      const last = out[out.length - 1];
      if (last && last.group === item.group) last.items.push({ item, idx });
      else out.push({ group: item.group, items: [{ item, idx }] });
    });
    return out;
  }, [results]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
          style={{ background: "var(--overlay)", backdropFilter: "blur(4px)" }}
          variants={backdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          onClick={close}
        >
          <motion.div
            className="w-full max-w-xl rounded-card border border-[var(--border-default)] overflow-hidden shadow-2xl"
            style={{ background: "var(--bg-elevated)" }}
            variants={reduce ? undefined : menuVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-2.5 px-4 h-14 border-b border-[var(--border-default)]">
              <Search size={17} className="text-[var(--text-muted)] shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Jump to a scene, character, prop, page — or run an action…"
                className="flex-1 bg-transparent border-0 outline-none text-sm p-0 h-auto focus:border-0"
                style={{ boxShadow: "none" }}
              />
              <kbd className="hidden sm:inline text-[10px] text-[var(--text-muted)] px-1.5 py-0.5 rounded border border-[var(--border-default)]">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
              {results.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                  No matches for “{query}”.
                </div>
              ) : (
                grouped.map((section) => (
                  <div key={section.group} className="mb-1">
                    <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {section.group}
                    </div>
                    {section.items.map(({ item, idx }) => (
                      <button
                        key={item.id}
                        data-idx={idx}
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => item.run()}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2 text-left",
                          idx === active
                            ? "bg-[var(--active-tint)]"
                            : "hover:bg-[var(--bg-surface-hover)]"
                        )}
                      >
                        <span className="w-5 flex items-center justify-center text-[var(--text-secondary)] shrink-0">
                          {item.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-[var(--text-primary)] truncate">
                            {item.title}
                          </span>
                          {item.subtitle && (
                            <span className="block text-[11px] text-[var(--text-muted)] truncate">
                              {item.subtitle}
                            </span>
                          )}
                        </span>
                        {idx === active && (
                          <CornerDownLeft size={13} className="text-[var(--text-muted)] shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center gap-4 px-4 h-9 border-t border-[var(--border-default)] text-[10px] text-[var(--text-muted)]">
              <span className="flex items-center gap-1">
                <kbd className="px-1 rounded border border-[var(--border-default)]">↑</kbd>
                <kbd className="px-1 rounded border border-[var(--border-default)]">↓</kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 rounded border border-[var(--border-default)]">↵</kbd> open
              </span>
              <span className="ml-auto flex items-center gap-1">
                <kbd className="px-1 rounded border border-[var(--border-default)]">⌘</kbd>
                <kbd className="px-1 rounded border border-[var(--border-default)]">K</kbd>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
