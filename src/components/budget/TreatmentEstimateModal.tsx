// ============================================================
// ESTIMATE FROM A TREATMENT — paste the pitch, get a top sheet
//
// The counterpart to `BudgetImportModal`: that one reads a budget somebody
// already wrote, this one builds the first one from the treatment. Same rule
// applies — nothing is written until a human has looked at it — but the review
// screen is a different shape, because here the numbers are *derived* rather
// than read:
//
//   - The assumptions panel is the real control. Every figure on the sheet is
//     quantity × rate over those inputs, so changing "episodes" moves all fifty
//     lines at once and the reviewer argues with one number instead of fifty.
//   - Every line still shows its working and stays individually editable; an
//     edit is stored against the rate-card key, so it survives the next
//     assumption change instead of being recomputed away.
//   - The AI reads the treatment for facts and loads, never for money. When it
//     fails, the deterministic read stands and the banner says so — a weaker
//     answer is never presented as the same answer.
// ============================================================

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Wand2,
  Upload,
  AlertTriangle,
  Info,
  Plus,
  Trash2,
  Users,
  MapPin,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useStore } from "@/state/store";
import { extractPdfText } from "@/lib/pdf";
import { pushToast } from "@/lib/toast";
import { formatCurrency, cn } from "@/lib/utils";
import { BUDGET_SECTIONS, sectionLabel } from "@/lib/budgetImport";
import {
  LOAD_KEYS,
  LOAD_LABELS,
  looksLikeTreatment,
  parseTreatment,
  type TreatmentCharacter,
  type TreatmentLocation,
  type TreatmentProfile,
} from "@/lib/treatment";
import {
  castDayRate,
  derive,
  estimateBudget,
  estimateBySection,
  estimateTotal,
  estimateToBudgetLines,
  localizeLines,
  profileToAssumptions,
  TIER_LABELS,
  type EstimateAssumptions,
  type EstimateOverrides,
  type EstimateTier,
  type ExtraEstimateLine,
} from "@/lib/budgetEstimate";
import { aiTreatmentProfile } from "@/lib/claude";

type Step = "input" | "review";

const ACCEPT = ".pdf,.txt,.md,.rtf";

export function TreatmentEstimateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const importBudgetLines = useStore((s) => s.importBudgetLines);
  const addCastMember = useStore((s) => s.addCastMember);
  const addRecord = useStore((s) => s.addRecord);
  const updateProductionMeta = useStore((s) => s.updateProductionMeta);
  const production = useStore((s) => s.production);
  const existingCount = useStore((s) => s.budgetLines.length);

  const [step, setStep] = useState<Step>("input");
  const [text, setText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNotes, setAiNotes] = useState<string[]>([]);
  const [aiRan, setAiRan] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<TreatmentProfile | null>(null);
  const [assumptions, setAssumptions] = useState<EstimateAssumptions | null>(null);
  const [extras, setExtras] = useState<ExtraEstimateLine[]>([]);
  const [overrides, setOverrides] = useState<EstimateOverrides>({});
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const [applyCast, setApplyCast] = useState(true);
  const [applyLocations, setApplyLocations] = useState(true);
  const [applyMeta, setApplyMeta] = useState(true);
  const [skippedCast, setSkippedCast] = useState<Set<string>>(new Set());
  const [skippedLocations, setSkippedLocations] = useState<Set<string>>(new Set());

  const reset = useCallback(() => {
    setStep("input");
    setText("");
    setSourceName("");
    setBusy(false);
    setError(null);
    setAiError(null);
    setAiNotes([]);
    setAiRan(false);
    setProfile(null);
    setAssumptions(null);
    setExtras([]);
    setOverrides({});
    setSkippedCast(new Set());
    setSkippedLocations(new Set());
  }, []);

  const close = () => {
    onClose();
    window.setTimeout(reset, 250);
  };

  /** Read the text, then let the model refine what the text-only pass found. */
  const run = useCallback(
    async (raw: string, name: string) => {
      if (!looksLikeTreatment(raw)) {
        setError("That's too short to read as a treatment — paste the pitch, synopsis or series bible.");
        return;
      }
      setBusy(true);
      setError(null);
      setAiError(null);
      setSourceName(name);

      const base = parseTreatment(raw);
      let merged = base;
      let extraLines: ExtraEstimateLine[] = [];

      try {
        const { profile: ai } = await aiTreatmentProfile(raw, production.currency, base.language);
        if (ai) {
          setAiRan(true);
          setAiNotes(ai.notes);
          merged = {
            ...base,
            title: ai.title || base.title,
            format: ai.format ?? base.format,
            // The model reads a stated range better than a regex does, but a
            // count it never mentions must not wipe the one the text stated.
            episodes: ai.format === "film" ? 1 : (ai.episodes ?? base.episodes),
            episodeMinutes: ai.episodeMinutes ?? base.episodeMinutes,
            genres: ai.genres.length ? ai.genres : base.genres,
            characters: ai.characters.length
              ? ai.characters.map((c) => ({ name: c.name, billing: c.billing, note: c.note }))
              : base.characters,
            locations: ai.locations.length ? ai.locations : base.locations,
            loads: { ...base.loads, ...(ai.loads as Partial<typeof base.loads>) },
          };
          extraLines = ai.extraLines.map((l, i) => ({
            key: `ai_${i}`,
            section: BUDGET_SECTIONS.some((s) => s.id === l.section) ? l.section : "other",
            description: l.description,
            unit: l.unit,
            qty: l.qty,
            rate: l.rate,
            why: l.why,
          }));
        }
      } catch (e) {
        // The text-only read is a complete answer on its own — the run
        // continues, and the banner says which one the user is looking at.
        setAiError(e instanceof Error ? e.message : "The AI pass could not be reached.");
      }

      setProfile(merged);
      setAssumptions(profileToAssumptions(merged, production.currency));
      setExtras(extraLines);
      setOverrides({});
      setMode(existingCount > 0 ? "replace" : "append");
      setStep("review");
      setBusy(false);
    },
    [existingCount, production.currency]
  );

  const ingest = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const content = /\.pdf$/i.test(file.name)
          ? (await extractPdfText(file)).text
          : await file.text();
        setText(content);
        await run(content, file.name);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not read that file.");
        setBusy(false);
      }
    },
    [run]
  );

  const lang = profile?.language ?? "en";
  const lines = useMemo(() => {
    if (!assumptions) return [];
    return localizeLines(estimateBudget(assumptions, extras, overrides), lang);
  }, [assumptions, extras, overrides, lang]);

  const total = estimateTotal(lines);
  const d = assumptions ? derive(assumptions) : null;

  const patchAssumption = (patch: Partial<EstimateAssumptions>) =>
    setAssumptions((prev) => (prev ? { ...prev, ...patch } : prev));

  const patchLine = (key: string, patch: EstimateOverrides[string]) =>
    setOverrides((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const addLine = () => {
    const key = `user_${Date.now().toString(36)}`;
    setExtras((prev) => [
      ...prev,
      { key, section: "other", description: "New line", unit: "unit", qty: 1, rate: 0 },
    ]);
  };

  const apply = () => {
    if (!assumptions || !profile || !d) return;
    const budgetLines = estimateToBudgetLines(lines, lang);
    importBudgetLines(budgetLines, mode, {
      fileName: sourceName || `Estimate — ${assumptions.title}`,
      currency: assumptions.currency,
    });

    let castAdded = 0;
    if (applyCast) {
      for (const c of profile.characters) {
        if (skippedCast.has(c.name)) continue;
        addCastMember({
          // The actor is not cast yet, so the character name stands in for both
          // — renaming the person later is one field, inventing a placeholder
          // that has to be found again is not.
          name: c.name,
          role: c.name,
          category: c.billing,
          scenes: [],
          ratePerDay: castDayRate(assumptions, c.billing),
        });
        castAdded++;
      }
    }

    let locAdded = 0;
    if (applyLocations) {
      for (const l of profile.locations) {
        if (skippedLocations.has(l.name)) continue;
        addRecord("locations", {
          name: l.name,
          type: "EXT",
          permitStatus: "scouting",
          notes: l.note ? `From the treatment: ${l.note}` : "Named in the treatment.",
        });
        locAdded++;
      }
    }

    if (applyMeta) {
      updateProductionMeta({
        title: assumptions.title || production.title,
        currency: assumptions.currency,
        totalShootDays: d.shootDays,
      });
    }

    pushToast({
      title: `Estimate created — ${formatCurrency(total, assumptions.currency)}`,
      description: [
        `${budgetLines.length} budget lines`,
        castAdded ? `${castAdded} cast` : "",
        locAdded ? `${locAdded} locations` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      tone: "success",
    });
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title="Estimate a budget from a treatment"
      subtitle={
        step === "input"
          ? "Paste the pitch, synopsis or series bible — Arabic or English."
          : `${profile?.title ?? "Untitled"} · ${lines.length} lines · ${formatCurrency(total, assumptions?.currency ?? production.currency)}`
      }
      footer={
        step === "review" && (
          <div className="flex items-center justify-between gap-4 w-full">
            <ModeToggle mode={mode} setMode={setMode} existingCount={existingCount} />
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setStep("input")}>
                Back
              </Button>
              <Button onClick={apply} disabled={lines.length === 0}>
                Create budget ({formatCurrency(total, assumptions?.currency ?? production.currency)})
              </Button>
            </div>
          </div>
        )
      }
    >
      {step === "input" ? (
        <InputStep
          text={text}
          setText={setText}
          busy={busy}
          error={error}
          dragging={dragging}
          setDragging={setDragging}
          inputRef={inputRef}
          onFile={(f) => void ingest(f)}
          onRun={() => void run(text, "Pasted treatment")}
        />
      ) : (
        assumptions &&
        profile &&
        d && (
          <ReviewStep
            profile={profile}
            setProfile={setProfile}
            assumptions={assumptions}
            derived={d}
            patchAssumption={patchAssumption}
            lines={lines}
            overrides={overrides}
            patchLine={patchLine}
            addLine={addLine}
            total={total}
            aiRan={aiRan}
            aiError={aiError}
            aiNotes={aiNotes}
            lang={lang}
            applyCast={applyCast}
            setApplyCast={setApplyCast}
            applyLocations={applyLocations}
            setApplyLocations={setApplyLocations}
            applyMeta={applyMeta}
            setApplyMeta={setApplyMeta}
            skippedCast={skippedCast}
            setSkippedCast={setSkippedCast}
            skippedLocations={skippedLocations}
            setSkippedLocations={setSkippedLocations}
          />
        )
      )}
    </Modal>
  );
}

// ------------------------------------------------------------
// Step 1 — the treatment
// ------------------------------------------------------------

function InputStep({
  text,
  setText,
  busy,
  error,
  dragging,
  setDragging,
  inputRef,
  onFile,
  onRun,
}: {
  text: string;
  setText: (v: string) => void;
  busy: boolean;
  error: string | null;
  dragging: boolean;
  setDragging: (v: boolean) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  onFile: (f: File) => void;
  onRun: () => void;
}) {
  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        className={cn(
          "rounded-card border border-dashed transition-colors",
          dragging ? "border-[var(--accent-blue)] bg-[var(--active-tint)]" : "border-[var(--border-default)]"
        )}
      >
        <textarea
          dir="auto"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder={"مسلسل (اسم العمل)\n\nالنوع: دراما – أكشن\nعدد الحلقات: 10-12\nمدة الحلقة: 35–45 دقيقة\n\nالقصة…\n\nالشخصيات…\n\nمعالم التصوير…"}
          className="w-full bg-transparent border-0 p-4 text-sm resize-y focus:outline-none focus:ring-0"
        />
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border-default)] px-3 py-2">
          <div className="text-xs text-[var(--text-muted)]">
            {text.trim().length > 0
              ? `${text.trim().length.toLocaleString()} characters`
              : "Paste the text, or drop a PDF / TXT here"}
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Upload size={13} />}
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              Upload file
            </Button>
            <Button
              size="sm"
              leftIcon={busy ? <RefreshCw size={13} className="animate-spin" /> : <Wand2 size={13} />}
              onClick={onRun}
              disabled={busy || text.trim().length < 120}
            >
              {busy ? "Reading…" : "Read & estimate"}
            </Button>
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
        The treatment is read for the facts a budget needs — format, episode count and length,
        the named parts, the places it shoots, and how hard it works the unit (action, stunts,
        crowds, period, aerial, water, night). Those become <strong>assumptions you can edit</strong>,
        and a rate card turns them into a full top sheet where every line shows its own
        arithmetic. Nothing is written to the project until you press Create budget.
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Step 2 — assumptions, lines, and what else to create
// ------------------------------------------------------------

function ReviewStep(props: {
  profile: TreatmentProfile;
  setProfile: React.Dispatch<React.SetStateAction<TreatmentProfile | null>>;
  assumptions: EstimateAssumptions;
  derived: ReturnType<typeof derive>;
  patchAssumption: (p: Partial<EstimateAssumptions>) => void;
  lines: ReturnType<typeof estimateBudget>;
  overrides: EstimateOverrides;
  patchLine: (key: string, patch: EstimateOverrides[string]) => void;
  addLine: () => void;
  total: number;
  aiRan: boolean;
  aiError: string | null;
  aiNotes: string[];
  lang: "ar" | "en";
  applyCast: boolean;
  setApplyCast: (v: boolean) => void;
  applyLocations: boolean;
  setApplyLocations: (v: boolean) => void;
  applyMeta: boolean;
  setApplyMeta: (v: boolean) => void;
  skippedCast: Set<string>;
  setSkippedCast: React.Dispatch<React.SetStateAction<Set<string>>>;
  skippedLocations: Set<string>;
  setSkippedLocations: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const {
    profile,
    setProfile,
    assumptions: a,
    derived: d,
    patchAssumption,
    lines,
    patchLine,
    addLine,
    total,
    aiRan,
    aiError,
    aiNotes,
    lang,
  } = props;
  const [tab, setTab] = useState<"assumptions" | "lines" | "extract">("assumptions");
  const currency = a.currency;
  const perEpisode = a.format === "series" && a.episodes > 0 ? total / a.episodes : null;
  const sections = estimateBySection(lines);

  return (
    <div className="space-y-4">
      {/* Headline — the three numbers a producer checks first. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Estimated total" value={formatCurrency(total, currency)} strong />
        <Tile
          label={a.format === "series" ? "Per episode" : "Per shoot day"}
          value={formatCurrency(perEpisode ?? total / Math.max(1, d.shootDays), currency)}
        />
        <Tile label="Shoot days" value={`${d.shootDays}`} note={`${d.shootWeeks} weeks`} />
        <Tile
          label="Cost per shoot day"
          value={formatCurrency(total / Math.max(1, d.shootDays), currency)}
        />
      </div>

      {aiError ? (
        <Banner tone="warning" icon={<AlertTriangle size={16} />}>
          The AI pass didn&apos;t run ({aiError}) — this estimate comes from the text-only read of the
          treatment. Everything below is still editable, and the numbers are the same rate card.
        </Banner>
      ) : aiRan ? (
        <Banner tone="ai" icon={<Sparkles size={16} />}>
          Read by AI and by the text parser together. The model supplied the facts and the load
          scores; every figure below is arithmetic over the assumptions, not a number the model
          picked.
        </Banner>
      ) : null}

      {aiNotes.length > 0 && (
        <div className="rounded-button border border-[var(--border-default)] p-3 text-xs text-[var(--text-secondary)] space-y-1">
          <div className="section-header mb-1">Before you trust it</div>
          {aiNotes.map((n, i) => (
            <div key={i} dir="auto">
              · {n}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-[var(--border-default)]">
        {(
          [
            ["assumptions", "Assumptions"],
            ["lines", `Lines (${lines.length})`],
            ["extract", `Cast & locations (${profile.characters.length + profile.locations.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
              tab === id
                ? "border-[var(--accent-blue)] text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "assumptions" && (
        <AssumptionsPanel
          a={a}
          d={d}
          patch={patchAssumption}
          sections={sections}
          lang={lang}
          currency={currency}
          profile={profile}
          setProfile={setProfile}
        />
      )}

      {tab === "lines" && (
        <LinesPanel
          lines={lines}
          currency={currency}
          lang={lang}
          patchLine={patchLine}
          addLine={addLine}
          total={total}
        />
      )}

      {tab === "extract" && <ExtractPanel {...props} />}
    </div>
  );
}

// ---- Assumptions ----

function AssumptionsPanel({
  a,
  d,
  patch,
  sections,
  lang,
  currency,
  profile,
  setProfile,
}: {
  a: EstimateAssumptions;
  d: ReturnType<typeof derive>;
  patch: (p: Partial<EstimateAssumptions>) => void;
  sections: { section: string; total: number }[];
  lang: "ar" | "en";
  currency: string;
  profile: TreatmentProfile;
  setProfile: React.Dispatch<React.SetStateAction<TreatmentProfile | null>>;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Group title="The production">
            <TextField label="Title" value={a.title} onChange={(v) => patch({ title: v })} />
            <SelectField
              label="Format"
              value={a.format}
              options={[
                ["series", "Series"],
                ["film", "Feature film"],
              ]}
              onChange={(v) => patch({ format: v as "series" | "film", episodes: v === "film" ? 1 : a.episodes })}
            />
            {a.format === "series" && (
              <NumField label="Episodes" value={a.episodes} onChange={(v) => patch({ episodes: v })} />
            )}
            <NumField
              label="Minutes / episode"
              value={a.episodeMinutes}
              onChange={(v) => patch({ episodeMinutes: v })}
            />
            <NumField
              label={a.format === "series" ? "Shoot days / episode" : "Shoot days"}
              value={a.shootDaysPerEpisode}
              onChange={(v) => patch({ shootDaysPerEpisode: v })}
              note={`= ${d.shootDays} shoot days`}
            />
            <NumField label="Prep weeks" value={a.prepWeeks} onChange={(v) => patch({ prepWeeks: v })} />
            <NumField label="Post weeks" value={a.postWeeks} onChange={(v) => patch({ postWeeks: v })} />
            <NumField
              label="% of days on a stage"
              value={a.studioDayPct}
              onChange={(v) => patch({ studioDayPct: v })}
              note={`${d.studioDays} stage / ${d.locationDays} location`}
            />
          </Group>

          <Group title="People">
            <NumField label="Crew size" value={a.crewSize} onChange={(v) => patch({ crewSize: v })} />
            <NumField label="Lead cast" value={a.castLeads} onChange={(v) => patch({ castLeads: v })} />
            <NumField
              label="Supporting cast"
              value={a.castSupporting}
              onChange={(v) => patch({ castSupporting: v })}
            />
            <NumField
              label="Day players"
              value={a.castDayPlayers}
              onChange={(v) => patch({ castDayPlayers: v })}
            />
            <NumField
              label="Extras / shoot day"
              value={a.extrasPerShootDay}
              onChange={(v) => patch({ extrasPerShootDay: v })}
            />
            <NumField
              label="Nights away (per crew)"
              value={a.travelDays}
              onChange={(v) => patch({ travelDays: v })}
              note="Drives hotels + per diems"
            />
          </Group>

          <Group title="What the story asks for">
            <NumField label="Stunt days" value={a.stuntDays} onChange={(v) => patch({ stuntDays: v })} />
            <NumField label="Aerial days" value={a.aerialDays} onChange={(v) => patch({ aerialDays: v })} />
            <NumField label="VFX shots" value={a.vfxShots} onChange={(v) => patch({ vfxShots: v })} />
            <NumField
              label="% night shooting"
              value={a.nightShootPct}
              onChange={(v) => patch({ nightShootPct: v })}
              note={`${d.nightDays} nights`}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={a.periodDual}
                onChange={(e) => patch({ periodDual: e.target.checked })}
              />
              Two eras to dress (period)
            </label>
          </Group>

          <Group title="Money">
            <SelectField
              label="Tier"
              value={a.tier}
              options={(Object.keys(TIER_LABELS) as EstimateTier[]).map((t) => [t, TIER_LABELS[t].en])}
              onChange={(v) => patch({ tier: v as EstimateTier })}
              note={TIER_LABELS[a.tier].note}
            />
            <TextField label="Currency" value={a.currency} onChange={(v) => patch({ currency: v.toUpperCase() })} />
            <NumField
              label="Rate scale"
              value={a.rateScale}
              step={0.01}
              onChange={(v) => patch({ rateScale: v })}
              note="Card is quoted in AED; this converts it. Indicative — adjust to your market."
            />
            <NumField
              label="Contingency %"
              value={a.contingencyPct}
              onChange={(v) => patch({ contingencyPct: v })}
            />
            <NumField label="Insurance %" value={a.insurancePct} onChange={(v) => patch({ insurancePct: v })} />
          </Group>
        </div>

        <div className="space-y-4">
          <div className="rounded-card border border-[var(--border-default)] p-3">
            <div className="section-header mb-2">By section</div>
            <div className="space-y-1.5">
              {sections.map((s) => (
                <div key={s.section} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[var(--text-secondary)] truncate" dir="auto">
                      {sectionLabel(s.section, lang)}
                    </span>
                    <span className="tabular-nums">{formatCurrency(s.total, currency)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-card border border-[var(--border-default)] p-3">
            <div className="section-header mb-2">Story loads</div>
            <div className="space-y-2">
              {LOAD_KEYS.map((k) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[var(--text-secondary)]">{LOAD_LABELS[k].en}</span>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    value={profile.loads[k]}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setProfile((p) => (p ? { ...p, loads: { ...p.loads, [k]: v } } : p));
                      // The loads only matter through the assumptions they
                      // seed, so moving one re-seeds just the fields it owns
                      // and leaves everything the user has already tuned.
                      if (k === "stunts" || k === "action") {
                        patch({ stuntDays: v === 0 ? 0 : Math.max(1, Math.round(d.shootDays * 0.04 * v)) });
                      }
                      if (k === "aerial") {
                        patch({ aerialDays: v === 0 ? 0 : Math.max(1, Math.round(d.shootDays * 0.03 * v)) });
                      }
                      if (k === "vfx") patch({ vfxShots: [0, 15, 45, 120][v] });
                      if (k === "crowd") patch({ extrasPerShootDay: [0, 8, 20, 40][v] });
                      if (k === "night") patch({ nightShootPct: [5, 15, 25, 35][v] });
                      if (k === "period") patch({ periodDual: v >= 3 });
                    }}
                    className="w-24"
                  />
                </div>
              ))}
            </div>
          </div>

          {profile.evidence.length > 0 && (
            <div className="rounded-card border border-[var(--border-default)] p-3">
              <div className="section-header mb-2">Read from the text</div>
              <div className="space-y-1 text-[11px] text-[var(--text-muted)]">
                {profile.evidence.map((e, i) => (
                  <div key={i} dir="auto">
                    · {e}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Lines ----

function LinesPanel({
  lines,
  currency,
  lang,
  patchLine,
  addLine,
  total,
}: {
  lines: ReturnType<typeof estimateBudget>;
  currency: string;
  lang: "ar" | "en";
  patchLine: (key: string, patch: EstimateOverrides[string]) => void;
  addLine: () => void;
  total: number;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-[var(--text-secondary)]">
          Every line is quantity × rate over the assumptions. Edit any of them — an edit sticks
          even when you change the assumptions afterwards.
        </div>
        <Button size="sm" variant="secondary" leftIcon={<Plus size={13} />} onClick={addLine}>
          Add line
        </Button>
      </div>

      <div className="overflow-x-auto max-h-[46vh] overflow-y-auto rounded-card border border-[var(--border-default)]">
        <table className="pos-table">
          <thead>
            <tr>
              <th className="min-w-[260px]">Line</th>
              <th className="w-[80px] text-right">Qty</th>
              <th className="w-[110px]">Unit</th>
              <th className="w-[110px] text-right">Rate</th>
              <th className="w-[130px] text-right">Amount</th>
              <th className="w-[180px]">Section</th>
              <th className="w-[44px]" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key}>
                <td>
                  <input
                    dir="auto"
                    value={l.description}
                    onChange={(e) => patchLine(l.key, { description: e.target.value })}
                    className="w-full bg-transparent border-0 px-0 py-0 text-sm focus:outline-none focus:ring-0"
                  />
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-2">
                    <span>{l.basis}</span>
                    {l.source === "ai" && <Badge tone="info">from the treatment</Badge>}
                    {l.why && <span className="truncate">· {l.why}</span>}
                  </div>
                </td>
                <td className="text-right">
                  {l.pct === undefined ? (
                    <NumCell value={l.qty} onChange={(v) => patchLine(l.key, { qty: v, amount: undefined })} />
                  ) : (
                    <span className="text-xs text-[var(--text-muted)]">—</span>
                  )}
                </td>
                <td className="text-xs text-[var(--text-secondary)]">{l.unit}</td>
                <td className="text-right">
                  <NumCell
                    value={l.pct === undefined ? l.rate : (l.pct ?? 0)}
                    onChange={(v) => patchLine(l.key, { rate: v, amount: undefined })}
                  />
                </td>
                <td className="text-right">
                  <NumCell
                    value={l.amount}
                    onChange={(v) => patchLine(l.key, { amount: v })}
                    strong
                  />
                </td>
                <td>
                  <select
                    value={l.section}
                    onChange={(e) => patchLine(l.key, { section: e.target.value })}
                    className="w-full text-xs rounded-button"
                  >
                    {BUDGET_SECTIONS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {lang === "ar" ? s.ar : s.en}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    onClick={() => patchLine(l.key, { removed: true })}
                    title="Not needed on this production"
                    className="p-1.5 rounded-button text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--bg-surface-hover)]"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            <tr className="font-semibold" style={{ background: "var(--bg-surface-hover)" }}>
              <td colSpan={4}>Total</td>
              <td className="text-right">{formatCurrency(total, currency)}</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Cast & locations ----

function ExtractPanel({
  profile,
  setProfile,
  applyCast,
  setApplyCast,
  applyLocations,
  setApplyLocations,
  applyMeta,
  setApplyMeta,
  skippedCast,
  setSkippedCast,
  skippedLocations,
  setSkippedLocations,
}: {
  profile: TreatmentProfile;
  setProfile: React.Dispatch<React.SetStateAction<TreatmentProfile | null>>;
  applyCast: boolean;
  setApplyCast: (v: boolean) => void;
  applyLocations: boolean;
  setApplyLocations: (v: boolean) => void;
  applyMeta: boolean;
  setApplyMeta: (v: boolean) => void;
  skippedCast: Set<string>;
  setSkippedCast: React.Dispatch<React.SetStateAction<Set<string>>>;
  skippedLocations: Set<string>;
  setSkippedLocations: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const toggle = (
    set: React.Dispatch<React.SetStateAction<Set<string>>>,
    key: string
  ) =>
    set((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const patchCharacter = (i: number, patch: Partial<TreatmentCharacter>) =>
    setProfile((p) =>
      p ? { ...p, characters: p.characters.map((c, j) => (j === i ? { ...c, ...patch } : c)) } : p
    );
  const patchLocation = (i: number, patch: Partial<TreatmentLocation>) =>
    setProfile((p) =>
      p ? { ...p, locations: p.locations.map((l, j) => (j === i ? { ...l, ...patch } : l)) } : p
    );

  return (
    <div className="space-y-4">
      <Banner tone="info" icon={<Info size={16} />}>
        The treatment named these. Tick what should be created alongside the budget — the cast
        records open with the day rate the estimate priced them at, and the locations open at
        “scouting”.
      </Banner>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={applyMeta} onChange={(e) => setApplyMeta(e.target.checked)} />
        Set the production&apos;s title, currency and shoot-day count from these assumptions
      </label>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-card border border-[var(--border-default)]">
          <div className="flex items-center justify-between p-3 border-b border-[var(--border-default)]">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users size={14} /> Characters ({profile.characters.length})
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={applyCast} onChange={(e) => setApplyCast(e.target.checked)} />
              Add to Cast
            </label>
          </div>
          <div className="max-h-[38vh] overflow-y-auto divide-y divide-[var(--border-default)]">
            {profile.characters.length === 0 && (
              <div className="p-3 text-xs text-[var(--text-muted)]">
                No character section found in the treatment.
              </div>
            )}
            {profile.characters.map((c, i) => (
              <div key={`${c.name}-${i}`} className="flex items-center gap-2 p-2">
                <input
                  type="checkbox"
                  checked={!skippedCast.has(c.name)}
                  onChange={() => toggle(setSkippedCast, c.name)}
                  disabled={!applyCast}
                />
                <input
                  dir="auto"
                  value={c.name}
                  onChange={(e) => patchCharacter(i, { name: e.target.value })}
                  className="flex-1 bg-transparent border-0 px-0 py-0 text-sm focus:outline-none focus:ring-0"
                />
                <select
                  value={c.billing}
                  onChange={(e) => patchCharacter(i, { billing: e.target.value as TreatmentCharacter["billing"] })}
                  className="text-xs rounded-button w-[110px]"
                >
                  <option value="lead">Lead</option>
                  <option value="supporting">Supporting</option>
                  <option value="day_player">Day player</option>
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-card border border-[var(--border-default)]">
          <div className="flex items-center justify-between p-3 border-b border-[var(--border-default)]">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MapPin size={14} /> Locations ({profile.locations.length})
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={applyLocations}
                onChange={(e) => setApplyLocations(e.target.checked)}
              />
              Add to Locations
            </label>
          </div>
          <div className="max-h-[38vh] overflow-y-auto divide-y divide-[var(--border-default)]">
            {profile.locations.length === 0 && (
              <div className="p-3 text-xs text-[var(--text-muted)]">
                No location list found in the treatment.
              </div>
            )}
            {profile.locations.map((l, i) => (
              <div key={`${l.name}-${i}`} className="flex items-center gap-2 p-2">
                <input
                  type="checkbox"
                  checked={!skippedLocations.has(l.name)}
                  onChange={() => toggle(setSkippedLocations, l.name)}
                  disabled={!applyLocations}
                />
                <input
                  dir="auto"
                  value={l.name}
                  onChange={(e) => patchLocation(i, { name: e.target.value })}
                  className="flex-1 bg-transparent border-0 px-0 py-0 text-sm focus:outline-none focus:ring-0"
                />
                {l.note && (
                  <span className="text-[11px] text-[var(--text-muted)] truncate max-w-[120px]" dir="auto">
                    {l.note}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Small pieces
// ------------------------------------------------------------

function Tile({
  label,
  value,
  note,
  strong,
}: {
  label: string;
  value: string;
  note?: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-card border border-[var(--border-default)] p-3">
      <div className="section-header">{label}</div>
      <div className={cn("mt-1 tabular-nums", strong ? "text-xl font-semibold" : "text-lg font-medium")}>
        {value}
      </div>
      {note && <div className="text-xs text-[var(--text-muted)] mt-0.5">{note}</div>}
    </div>
  );
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: "info" | "warning" | "ai";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const style =
    tone === "warning"
      ? "border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.08)] text-[var(--color-warning)]"
      : tone === "ai"
        ? "border-[rgba(139,92,246,0.3)] bg-[rgba(139,92,246,0.08)] text-[var(--color-ai)]"
        : "border-[var(--border-default)] bg-[var(--bg-surface-hover)] text-[var(--text-secondary)]";
  return (
    <div className={cn("flex items-start gap-2 rounded-button border p-3 text-sm", style)}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-[var(--border-default)] p-3">
      <div className="section-header mb-3">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  note,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  note?: string;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs text-[var(--text-secondary)]">{label}</span>
      <input
        type="number"
        step={step}
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-8 text-sm mt-1"
      />
      {note && <span className="text-[11px] text-[var(--text-muted)]">{note}</span>}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-[var(--text-secondary)]">{label}</span>
      <input
        dir="auto"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 text-sm mt-1"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  note,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
  note?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-[var(--text-secondary)]">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full h-8 text-sm mt-1">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {note && <span className="text-[11px] text-[var(--text-muted)]">{note}</span>}
    </label>
  );
}

function NumCell({
  value,
  onChange,
  strong,
}: {
  value: number;
  onChange: (v: number) => void;
  strong?: boolean;
}) {
  return (
    <input
      inputMode="decimal"
      value={value}
      onChange={(e) => {
        const v = e.target.value.replace(/[^\d.]/g, "");
        onChange(v === "" ? 0 : Number(v));
      }}
      className={cn(
        "w-full bg-transparent border border-transparent hover:border-[var(--border-default)] rounded-button px-2 py-1 text-sm text-right tabular-nums",
        strong && "font-medium"
      )}
    />
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
        The top sheet is empty — the estimate will start it.
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
export function TreatmentEstimateButton({ onClick }: { onClick: () => void }) {
  return (
    <Button leftIcon={<Wand2 size={14} />} onClick={onClick}>
      Estimate from treatment
    </Button>
  );
}
