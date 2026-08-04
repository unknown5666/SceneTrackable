// ============================================================
// PARAMETRIC BUDGET ESTIMATE — assumptions × rate card → a top sheet
//
// The estimate is arithmetic, not opinion. A treatment gives counts (11
// episodes, 4 leads, heavy action); this module holds a rate card and
// multiplies. That split is the whole design, and it is why the AI is never
// asked for a figure:
//
//   - **Every line shows its working.** `basis` renders as "55 shoot days ×
//     4,500", so a producer can argue with the day rate instead of with a
//     number that arrived from nowhere.
//   - **Every line recomputes.** Change episodes from 11 to 12 and all 50 lines
//     move together. A model's one-shot list of amounts cannot do that, and a
//     budget that doesn't respond to its own assumptions is a screenshot.
//   - **Every line is overridable.** `EstimateOverrides` is keyed by rate-card
//     key, so a user's edited rate survives a change to the episode count —
//     the count re-drives the quantity, the edited rate stays edited.
//
// The card is a Gulf drama card quoted in AED. `rateScale` converts it to the
// project's currency at an indicative rate and is editable, because an FX table
// baked into an app goes stale and a market rate is not an FX rate anyway.
//
// Pure functions over plain data, so `scripts/estimate-test.ts` runs it in Node.
// ============================================================

import type { BudgetLine } from "@/types";
import type { ScriptLanguage } from "@/lib/lang";
import { BUDGET_SECTIONS, sectionDepartment, sectionLabel } from "@/lib/budgetImport";
import type { Billing, TreatmentProfile } from "@/lib/treatment";
import { id } from "@/lib/utils";

// ------------------------------------------------------------
// Assumptions — the editable inputs
// ------------------------------------------------------------

export type EstimateTier = "lean" | "standard" | "premium";

export interface EstimateAssumptions {
  title: string;
  currency: string;
  format: "series" | "film";
  /** 1 for a feature. */
  episodes: number;
  episodeMinutes: number;
  /** For a feature this is simply the shoot length, since `episodes` is 1. */
  shootDaysPerEpisode: number;
  prepWeeks: number;
  postWeeks: number;
  /** Share of shoot days on a stage rather than on location, 0–100. */
  studioDayPct: number;
  crewSize: number;
  castLeads: number;
  castSupporting: number;
  castDayPlayers: number;
  extrasPerShootDay: number;
  stuntDays: number;
  aerialDays: number;
  vfxShots: number;
  /** Nights away from base, per crew member — drives hotels and per diems. */
  travelDays: number;
  /** Two eras to dress and clothe, not one. */
  periodDual: boolean;
  nightShootPct: number;
  tier: EstimateTier;
  /** The AED card converted to `currency`. Indicative, and meant to be edited. */
  rateScale: number;
  contingencyPct: number;
  insurancePct: number;
}

/** Crew/kit quality, applied to every rate on the card. */
const TIER_MULTIPLIER: Record<EstimateTier, number> = {
  lean: 0.7,
  standard: 1,
  premium: 1.6,
};

export const TIER_LABELS: Record<EstimateTier, { en: string; ar: string; note: string }> = {
  lean: { en: "Lean", ar: "اقتصادي", note: "Local crew, minimum kit, short days." },
  standard: { en: "Standard", ar: "قياسي", note: "Full regional drama unit at market rates." },
  premium: { en: "Premium", ar: "مرتفع", note: "Name HODs, imported kit, international standard." },
};

/**
 * AED → other currencies, indicative only.
 *
 * The Gulf pegs (SAR, QAR, KWD, BHD, OMR) barely move, so those are as good as
 * exact. USD/EUR/GBP/EGP float, and this table will be wrong by the time anyone
 * reads it — which is fine, because it only seeds `rateScale`, a field on the
 * assumptions panel with its own explanation. Nothing downstream re-reads it.
 */
const CURRENCY_SCALE: Record<string, number> = {
  AED: 1,
  SAR: 1.02,
  QAR: 0.99,
  KWD: 0.083,
  BHD: 0.103,
  OMR: 0.105,
  USD: 0.272,
  EUR: 0.25,
  GBP: 0.21,
  EGP: 13.5,
  JOD: 0.193,
};

export function defaultRateScale(currency: string): number {
  return CURRENCY_SCALE[currency?.toUpperCase()] ?? 1;
}

// ------------------------------------------------------------
// Derived quantities — the numbers the card multiplies
// ------------------------------------------------------------

export interface EstimateDerived {
  shootDays: number;
  shootWeeks: number;
  totalWeeks: number;
  studioDays: number;
  locationDays: number;
  nightDays: number;
  principals: number;
}

export function derive(a: EstimateAssumptions): EstimateDerived {
  const episodes = a.format === "series" ? Math.max(1, a.episodes) : 1;
  const shootDays = Math.max(1, Math.round(episodes * a.shootDaysPerEpisode));
  // A six-day week is the regional norm; a five-day week would over-count the
  // weekly-rate departments by a fifth.
  const shootWeeks = Math.max(1, Math.ceil(shootDays / 6));
  const studioDays = Math.round((shootDays * clamp(a.studioDayPct, 0, 100)) / 100);
  return {
    shootDays,
    shootWeeks,
    totalWeeks: Math.max(1, a.prepWeeks) + shootWeeks + Math.max(0, a.postWeeks),
    studioDays,
    locationDays: shootDays - studioDays,
    nightDays: Math.round((shootDays * clamp(a.nightShootPct, 0, 100)) / 100),
    principals: a.castLeads + a.castSupporting,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}

// ------------------------------------------------------------
// The rate card
// ------------------------------------------------------------

interface RateItem {
  key: string;
  section: string;
  en: string;
  ar: string;
  unitEn: string;
  unitAr: string;
  /** Quantity in `unit`s, from the assumptions. 0 drops the line. */
  qty: (a: EstimateAssumptions, d: EstimateDerived) => number;
  /** Rate per unit, in AED at standard tier. */
  rate: (a: EstimateAssumptions, d: EstimateDerived) => number;
  /** A percentage of the rest of the sheet rather than a quantity × rate. */
  pct?: (a: EstimateAssumptions) => number;
  /** Why this line exists at all, when it isn't obvious. */
  whyEn?: string;
  whyAr?: string;
}

const flat = (n: number) => () => n;
const series = (a: EstimateAssumptions) => a.format === "series";

/**
 * The card. Ordered by section so the generated top sheet reads like one.
 *
 * Rates are AED, standard tier, a regional drama shooting in the Gulf. They are
 * a starting point a line producer corrects — which is exactly what the review
 * table is for — not a quote.
 */
const RATE_CARD: RateItem[] = [
  // ---------------- Above the line ----------------
  {
    key: "writer",
    section: "above_the_line",
    en: "Writer / screenplay",
    ar: "المؤلف والسيناريو",
    unitEn: "episode",
    unitAr: "حلقة",
    qty: (a) => (series(a) ? a.episodes : 1),
    rate: (a) => (series(a) ? 15000 : 150000),
  },
  {
    key: "director",
    section: "above_the_line",
    en: "Director",
    ar: "المخرج",
    unitEn: "shoot week",
    unitAr: "أسبوع تصوير",
    qty: (_a, d) => d.shootWeeks + 2,
    rate: flat(45000),
    whyEn: "Two weeks beyond the shoot for prep and the edit.",
    whyAr: "أسبوعان إضافيان للتحضير والمونتاج.",
  },
  {
    key: "producer",
    section: "above_the_line",
    en: "Producer",
    ar: "المنتج",
    unitEn: "week",
    unitAr: "أسبوع",
    qty: (_a, d) => d.totalWeeks,
    rate: flat(18000),
  },
  {
    key: "exec_producer",
    section: "above_the_line",
    en: "Executive producer & development",
    ar: "المنتج المنفذ والتطوير",
    unitEn: "production",
    unitAr: "عمل",
    qty: flat(1),
    rate: (a) => (series(a) ? 90000 : 60000),
  },

  // ---------------- Production crew ----------------
  {
    key: "line_producer",
    section: "production",
    en: "Line producer / production manager",
    ar: "مدير الإنتاج",
    unitEn: "week",
    unitAr: "أسبوع",
    qty: (_a, d) => d.totalWeeks,
    rate: flat(9000),
  },
  {
    key: "prod_coordinator",
    section: "production",
    en: "Production coordinator",
    ar: "منسق الإنتاج",
    unitEn: "week",
    unitAr: "أسبوع",
    qty: (_a, d) => d.totalWeeks,
    rate: flat(6000),
  },
  {
    key: "first_ad",
    section: "production",
    en: "1st assistant director",
    ar: "مساعد مخرج أول",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays + 10,
    rate: flat(2000),
    whyEn: "Ten prep days before the unit turns over.",
    whyAr: "عشرة أيام تحضير قبل بدء التصوير.",
  },
  {
    key: "second_ad",
    section: "production",
    en: "2nd assistant director",
    ar: "مساعد مخرج ثانٍ",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays,
    rate: flat(1200),
  },
  {
    key: "script_super",
    section: "production",
    en: "Script supervisor",
    ar: "سكريبت",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays,
    rate: flat(1300),
  },
  {
    key: "prod_assistants",
    section: "production",
    en: "Production assistants (×3)",
    ar: "منفذو إنتاج (×3)",
    unitEn: "person-day",
    unitAr: "يوم/فرد",
    qty: (_a, d) => d.shootDays * 3,
    rate: flat(500),
  },
  {
    key: "office",
    section: "production",
    en: "Production office, comms & expendables",
    ar: "مكتب الإنتاج والاتصالات والمستهلكات",
    unitEn: "week",
    unitAr: "أسبوع",
    qty: (_a, d) => d.totalWeeks,
    rate: flat(3500),
  },
  {
    key: "medic",
    section: "production",
    en: "Set medic & safety officer",
    ar: "مسعف وضابط سلامة",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (a, d) => (a.stuntDays > 0 ? d.shootDays : 0),
    rate: flat(900),
    whyEn: "Required once anything is staged as a stunt.",
    whyAr: "ضروري عند وجود مشاهد خطرة.",
  },

  // ---------------- Camera ----------------
  {
    key: "dop",
    section: "camera",
    en: "Director of photography",
    ar: "مدير التصوير",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays + 5,
    rate: flat(5000),
  },
  {
    key: "cam_operator",
    section: "camera",
    en: "Camera operator",
    ar: "مصور",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays,
    rate: flat(2200),
  },
  {
    key: "focus_puller",
    section: "camera",
    en: "1st AC / focus puller",
    ar: "مساعد كاميرا أول",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays,
    rate: flat(1600),
  },
  {
    key: "loader",
    section: "camera",
    en: "2nd AC / loader",
    ar: "مساعد كاميرا ثانٍ",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays,
    rate: flat(1100),
  },
  {
    key: "dit",
    section: "camera",
    en: "DIT / data wrangler",
    ar: "مسؤول البيانات",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays,
    rate: flat(1400),
  },
  {
    key: "cam_package",
    section: "camera",
    en: "Camera package (body + prime set)",
    ar: "معدات كاميرا (جسم + عدسات)",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays,
    rate: flat(4500),
  },
  {
    key: "cam_b",
    section: "camera",
    en: "B camera (action coverage)",
    ar: "كاميرا ثانية لتغطية الأكشن",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (a, d) => (a.stuntDays > 0 ? Math.round(d.shootDays * 0.6) : 0),
    rate: flat(2600),
    whyEn: "Fights and falls are covered twice or they are shot twice.",
    whyAr: "المعارك تُصوَّر بكاميرتين وإلا أُعيد تصويرها.",
  },
  {
    key: "specialty_lenses",
    section: "camera",
    en: "Specialty / high-speed package",
    ar: "عدسات وتصوير بطيء",
    unitEn: "day",
    unitAr: "يوم",
    qty: (a, d) => (a.stuntDays > 0 ? Math.max(2, Math.round(d.shootDays * 0.2)) : 0),
    rate: flat(3000),
  },
  {
    key: "gimbal",
    section: "camera",
    en: "Gimbal / Steadicam operator + rig",
    ar: "مشغل جيمبل/ستيدي كام مع المعدات",
    unitEn: "day",
    unitAr: "يوم",
    qty: (_a, d) => Math.round(d.shootDays * 0.4),
    rate: flat(3500),
  },
  {
    key: "drone",
    section: "camera",
    en: "Drone unit (pilot, kit, permit)",
    ar: "وحدة تصوير جوي (طيار ومعدات وتصريح)",
    unitEn: "day",
    unitAr: "يوم",
    qty: (a) => a.aerialDays,
    rate: flat(6500),
  },

  // ---------------- Lighting & grip ----------------
  {
    key: "gaffer",
    section: "lighting_grip",
    en: "Gaffer",
    ar: "مسؤول الإضاءة",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays,
    rate: flat(2200),
  },
  {
    key: "electrics",
    section: "lighting_grip",
    en: "Electricians (×2)",
    ar: "فنيو إضاءة (×2)",
    unitEn: "person-day",
    unitAr: "يوم/فرد",
    qty: (_a, d) => d.shootDays * 2,
    rate: flat(900),
  },
  {
    key: "key_grip",
    section: "lighting_grip",
    en: "Key grip",
    ar: "رئيس الحرفيين",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays,
    rate: flat(1800),
  },
  {
    key: "grips",
    section: "lighting_grip",
    en: "Grip crew (×2)",
    ar: "فنيو معدات (×2)",
    unitEn: "person-day",
    unitAr: "يوم/فرد",
    qty: (_a, d) => d.shootDays * 2,
    rate: flat(800),
  },
  {
    key: "lighting_package",
    section: "lighting_grip",
    en: "Lighting package",
    ar: "معدات إضاءة",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays,
    rate: flat(4000),
  },
  {
    key: "grip_package",
    section: "lighting_grip",
    en: "Grip & dolly package",
    ar: "معدات حركة وشاريو",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays,
    rate: flat(2500),
  },
  {
    key: "generator",
    section: "lighting_grip",
    en: "Generator + fuel",
    ar: "مولد كهرباء ووقود",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays,
    rate: flat(1800),
  },
  {
    key: "night_lighting",
    section: "lighting_grip",
    en: "Night lighting uplift (towers, extra units)",
    ar: "إضاءة ليلية إضافية (أبراج ووحدات)",
    unitEn: "night",
    unitAr: "ليلة",
    qty: (_a, d) => d.nightDays,
    rate: flat(3500),
    whyEn: "A night exterior lights a whole street, not a room.",
    whyAr: "المشهد الليلي الخارجي يضيء شارعاً كاملاً لا غرفة.",
  },
  {
    key: "crane",
    section: "lighting_grip",
    en: "Crane / technocrane days",
    ar: "أيام رافعة كاميرا",
    unitEn: "day",
    unitAr: "يوم",
    qty: (_a, d) => Math.max(1, Math.round(d.shootDays * 0.12)),
    rate: flat(7000),
  },

  // ---------------- Sound ----------------
  {
    key: "sound_mixer",
    section: "sound",
    en: "Production sound mixer",
    ar: "مهندس صوت",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays,
    rate: flat(2000),
  },
  {
    key: "boom_op",
    section: "sound",
    en: "Boom operator",
    ar: "مشغل ميكرفون",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays,
    rate: flat(1100),
  },
  {
    key: "sound_package",
    section: "sound",
    en: "Sound package (recorder, radio mics)",
    ar: "معدات صوت (مسجل وميكرفونات لاسلكية)",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays,
    rate: flat(1200),
  },

  // ---------------- Art, props & wardrobe ----------------
  {
    key: "designer",
    section: "art",
    en: "Production designer",
    ar: "مصمم المناظر",
    unitEn: "week",
    unitAr: "أسبوع",
    qty: (a, d) => a.prepWeeks + d.shootWeeks,
    rate: flat(12000),
  },
  {
    key: "art_director",
    section: "art",
    en: "Art director",
    ar: "مدير فني",
    unitEn: "week",
    unitAr: "أسبوع",
    qty: (a, d) => a.prepWeeks + d.shootWeeks,
    rate: flat(8000),
  },
  {
    key: "set_dressing",
    section: "art",
    en: "Set dressing & construction",
    ar: "الديكور والتنفيذ",
    unitEn: "episode",
    unitAr: "حلقة",
    qty: (a) => (series(a) ? a.episodes : 1),
    rate: (a) => (series(a) ? 25000 : 180000),
  },
  {
    key: "props",
    section: "art",
    en: "Props purchase & rental",
    ar: "شراء وتأجير الإكسسوارات",
    unitEn: "episode",
    unitAr: "حلقة",
    qty: (a) => (series(a) ? a.episodes : 1),
    rate: (a) => (series(a) ? 8000 : 60000),
  },
  {
    key: "art_crew",
    section: "art",
    en: "Art crew / swing gang (×3)",
    ar: "فريق الديكور (×3)",
    unitEn: "person-day",
    unitAr: "يوم/فرد",
    qty: (_a, d) => d.shootDays * 3,
    rate: flat(600),
  },
  {
    key: "period_dressing",
    section: "art",
    en: "Period dressing, wardrobe & picture vehicles",
    ar: "ديكور وأزياء ومركبات الفترة الزمنية",
    unitEn: "episode",
    unitAr: "حلقة",
    qty: (a) => (a.periodDual ? (series(a) ? a.episodes : 1) : 0),
    rate: (a) => (series(a) ? 12000 : 90000),
    whyEn: "Two eras means two sets of everything the camera sees.",
    whyAr: "زمنان يعنيان نسختين من كل ما تراه الكاميرا.",
  },
  {
    key: "costume_designer",
    section: "art",
    en: "Costume designer",
    ar: "مصمم الأزياء",
    unitEn: "week",
    unitAr: "أسبوع",
    qty: (a, d) => a.prepWeeks + d.shootWeeks,
    rate: flat(9000),
  },
  {
    key: "wardrobe_buy",
    section: "art",
    en: "Wardrobe purchase & rental",
    ar: "شراء وتأجير الملابس",
    unitEn: "principal",
    unitAr: "ممثل رئيسي",
    qty: (_a, d) => d.principals,
    rate: flat(4000),
  },
  {
    key: "wardrobe_crew",
    section: "art",
    en: "Wardrobe assistants (×2) & laundry",
    ar: "مساعدو ملابس (×2) وغسيل",
    unitEn: "person-day",
    unitAr: "يوم/فرد",
    qty: (_a, d) => d.shootDays * 2,
    rate: flat(650),
  },

  // ---------------- Makeup & hair ----------------
  {
    key: "key_makeup",
    section: "makeup",
    en: "Key makeup artist",
    ar: "خبير مكياج أول",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays,
    rate: flat(1800),
  },
  {
    key: "hair",
    section: "makeup",
    en: "Hair stylist",
    ar: "مصفف شعر",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays,
    rate: flat(1500),
  },
  {
    key: "makeup_assist",
    section: "makeup",
    en: "Makeup assistant (crowd days)",
    ar: "مساعد مكياج (أيام الحشود)",
    unitEn: "day",
    unitAr: "يوم",
    qty: (a, d) => (a.extrasPerShootDay >= 15 ? d.shootDays : 0),
    rate: flat(900),
  },
  {
    key: "makeup_consumables",
    section: "makeup",
    en: "Consumables, wigs & continuity kit",
    ar: "مستهلكات وباروكات وأدوات",
    unitEn: "episode",
    unitAr: "حلقة",
    qty: (a) => (series(a) ? a.episodes : 1),
    rate: (a) => (series(a) ? 4000 : 30000),
  },
  {
    key: "sfx_makeup",
    section: "makeup",
    en: "SFX makeup (cuts, bruises, ageing)",
    ar: "مكياج تأثيرات (جروح وكدمات وتقدم بالعمر)",
    unitEn: "day",
    unitAr: "يوم",
    qty: (a, d) => (a.stuntDays > 0 || a.periodDual ? Math.round(d.shootDays * 0.4) : 0),
    rate: flat(2500),
  },

  // ---------------- Cast & extras ----------------
  {
    key: "cast_leads",
    section: "cast",
    en: "Lead cast",
    ar: "الأدوار الرئيسية",
    unitEn: "cast day",
    unitAr: "يوم ممثل",
    // A lead is not on set every day even in their own show — 60% is the
    // working assumption a DOOD later replaces with the real count.
    qty: (a, d) => Math.round(a.castLeads * d.shootDays * 0.6),
    rate: flat(6000),
  },
  {
    key: "cast_supporting",
    section: "cast",
    en: "Supporting cast",
    ar: "الأدوار المساندة",
    unitEn: "cast day",
    unitAr: "يوم ممثل",
    qty: (a, d) => Math.round(a.castSupporting * d.shootDays * 0.35),
    rate: flat(2500),
  },
  {
    key: "cast_day_players",
    section: "cast",
    en: "Day players & small parts",
    ar: "أدوار يومية صغيرة",
    unitEn: "day",
    unitAr: "يوم",
    qty: (a) => a.castDayPlayers,
    rate: flat(1500),
  },
  {
    key: "extras",
    section: "cast",
    en: "Background artists",
    ar: "الكومبارس",
    unitEn: "extra day",
    unitAr: "يوم كومبارس",
    qty: (a, d) => a.extrasPerShootDay * d.shootDays,
    rate: flat(350),
  },
  {
    key: "casting",
    section: "cast",
    en: "Casting director & sessions",
    ar: "مدير اختيار الممثلين والتجارب",
    unitEn: "production",
    unitAr: "عمل",
    qty: flat(1),
    rate: (a) => (series(a) ? 35000 : 25000),
  },
  {
    key: "stunt_coord",
    section: "cast",
    en: "Stunt coordinator",
    ar: "منسق المشاهد الخطرة",
    unitEn: "day",
    unitAr: "يوم",
    qty: (a) => a.stuntDays,
    rate: flat(4000),
  },
  {
    key: "stunt_performers",
    section: "cast",
    en: "Stunt performers & doubles (×3)",
    ar: "منفذو مشاهد خطرة وبدلاء (×3)",
    unitEn: "person-day",
    unitAr: "يوم/فرد",
    qty: (a) => a.stuntDays * 3,
    rate: flat(2000),
  },

  // ---------------- Locations ----------------
  {
    key: "location_manager",
    section: "locations",
    en: "Location manager & assistant",
    ar: "مدير المواقع ومساعده",
    unitEn: "week",
    unitAr: "أسبوع",
    qty: (a, d) => a.prepWeeks + d.shootWeeks,
    rate: flat(7000),
  },
  {
    key: "location_fees",
    section: "locations",
    en: "Location fees",
    ar: "أجور المواقع",
    unitEn: "location day",
    unitAr: "يوم موقع",
    qty: (_a, d) => d.locationDays,
    rate: flat(6000),
  },
  {
    key: "studio",
    section: "locations",
    en: "Stage / studio rental",
    ar: "إيجار الاستوديو",
    unitEn: "stage day",
    unitAr: "يوم استوديو",
    qty: (_a, d) => d.studioDays,
    rate: flat(9000),
  },
  {
    key: "permits",
    section: "locations",
    en: "Permits & municipality fees",
    ar: "التصاريح والرسوم",
    unitEn: "location day",
    unitAr: "يوم موقع",
    qty: (_a, d) => d.locationDays,
    rate: flat(800),
  },
  {
    key: "scouting",
    section: "locations",
    en: "Scouting & recce",
    ar: "المعاينة والاستطلاع",
    unitEn: "prep week",
    unitAr: "أسبوع تحضير",
    qty: (a) => a.prepWeeks,
    rate: flat(2500),
  },
  {
    key: "site_costs",
    section: "locations",
    en: "Site security, cleaning & make-good",
    ar: "الأمن والنظافة وإعادة الموقع",
    unitEn: "location day",
    unitAr: "يوم موقع",
    qty: (_a, d) => d.locationDays,
    rate: flat(900),
  },

  // ---------------- Transport ----------------
  {
    key: "unit_vehicles",
    section: "transport",
    en: "Unit vehicles (crew vans)",
    ar: "مركبات الوحدة (باصات الطاقم)",
    unitEn: "vehicle day",
    unitAr: "يوم مركبة",
    qty: (a, d) => d.shootDays * Math.max(1, Math.ceil(a.crewSize / 12)),
    rate: flat(700),
  },
  {
    key: "trucks",
    section: "transport",
    en: "Trucks (camera, grip, art)",
    ar: "شاحنات (كاميرا ومعدات وديكور)",
    unitEn: "truck day",
    unitAr: "يوم شاحنة",
    qty: (_a, d) => d.shootDays * 3,
    rate: flat(1200),
  },
  {
    key: "drivers",
    section: "transport",
    en: "Drivers (×3)",
    ar: "سائقون (×3)",
    unitEn: "person-day",
    unitAr: "يوم/فرد",
    qty: (_a, d) => d.shootDays * 3,
    rate: flat(500),
  },
  {
    key: "fuel",
    section: "transport",
    en: "Fuel, tolls & parking",
    ar: "وقود ورسوم ومواقف",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays,
    rate: flat(900),
  },
  {
    key: "picture_vehicles",
    section: "transport",
    en: "Picture / action vehicles",
    ar: "مركبات المشاهد والأكشن",
    unitEn: "day",
    unitAr: "يوم",
    qty: (a, d) => (a.periodDual || a.stuntDays > 0 ? Math.round(d.shootDays * 0.3) : 0),
    rate: flat(2500),
  },

  // ---------------- Catering & accommodation ----------------
  {
    key: "meals",
    section: "catering",
    en: "Crew & cast meals",
    ar: "وجبات الطاقم والممثلين",
    unitEn: "meal",
    unitAr: "وجبة",
    qty: (a, d) => d.shootDays * (a.crewSize + d.principals),
    rate: flat(55),
  },
  {
    key: "craft",
    section: "catering",
    en: "Craft services, water & ice",
    ar: "الضيافة والمياه والثلج",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays,
    rate: flat(800),
  },
  {
    key: "hotels",
    section: "catering",
    en: "Accommodation",
    ar: "الإقامة",
    unitEn: "room night",
    unitAr: "ليلة غرفة",
    qty: (a) => a.travelDays * a.crewSize,
    rate: flat(350),
  },
  {
    key: "per_diems",
    section: "catering",
    en: "Per diems",
    ar: "بدل يومي",
    unitEn: "person-day",
    unitAr: "يوم/فرد",
    qty: (a) => a.travelDays * a.crewSize,
    rate: flat(120),
  },

  // ---------------- Post production ----------------
  {
    key: "editor",
    section: "post",
    en: "Offline editor",
    ar: "مونتير",
    unitEn: "post week",
    unitAr: "أسبوع مونتاج",
    qty: (a) => a.postWeeks,
    rate: flat(12000),
  },
  {
    key: "assistant_editor",
    section: "post",
    en: "Assistant editor",
    ar: "مساعد مونتير",
    unitEn: "post week",
    unitAr: "أسبوع مونتاج",
    qty: (a) => a.postWeeks,
    rate: flat(6000),
  },
  {
    key: "edit_suite",
    section: "post",
    en: "Edit suite, storage & backup",
    ar: "غرفة مونتاج وتخزين ونسخ احتياطي",
    unitEn: "post week",
    unitAr: "أسبوع مونتاج",
    qty: (a) => a.postWeeks,
    rate: flat(4000),
  },
  {
    key: "grade",
    section: "post",
    en: "Colour grade & online",
    ar: "تصحيح الألوان والمعالجة",
    unitEn: "episode",
    unitAr: "حلقة",
    qty: (a) => (series(a) ? a.episodes : 1),
    rate: (a) => (series(a) ? 9000 : 55000),
  },
  {
    key: "sound_post",
    section: "post",
    en: "Sound design & final mix",
    ar: "تصميم الصوت والمكساج النهائي",
    unitEn: "episode",
    unitAr: "حلقة",
    qty: (a) => (series(a) ? a.episodes : 1),
    rate: (a) => (series(a) ? 11000 : 70000),
  },
  {
    key: "music",
    section: "post",
    en: "Original music & licensing",
    ar: "الموسيقى الأصلية والحقوق",
    unitEn: "episode",
    unitAr: "حلقة",
    qty: (a) => (series(a) ? a.episodes : 1),
    rate: (a) => (series(a) ? 8000 : 60000),
  },
  {
    key: "vfx",
    section: "post",
    en: "VFX shots",
    ar: "لقطات المؤثرات البصرية",
    unitEn: "shot",
    unitAr: "لقطة",
    qty: (a) => a.vfxShots,
    rate: flat(2500),
  },
  {
    key: "titles",
    section: "post",
    en: "Titles & graphics package",
    ar: "التترات والجرافيكس",
    unitEn: "production",
    unitAr: "عمل",
    qty: flat(1),
    rate: flat(25000),
  },
  {
    key: "subtitles",
    section: "post",
    en: "Subtitling & QC",
    ar: "الترجمة والفحص الفني",
    unitEn: "episode",
    unitAr: "حلقة",
    qty: (a) => (series(a) ? a.episodes : 1),
    rate: (a) => (series(a) ? 2500 : 12000),
  },
  {
    key: "deliverables",
    section: "post",
    en: "Masters & deliverables",
    ar: "النسخ النهائية والتسليم",
    unitEn: "episode",
    unitAr: "حلقة",
    qty: (a) => (series(a) ? a.episodes : 1),
    rate: (a) => (series(a) ? 2000 : 15000),
  },

  // ---------------- Other & contingency ----------------
  {
    key: "legal",
    section: "other",
    en: "Legal, clearances & rights",
    ar: "الشؤون القانونية والحقوق",
    unitEn: "production",
    unitAr: "عمل",
    qty: flat(1),
    rate: flat(30000),
  },
  {
    key: "petty",
    section: "other",
    en: "Petty cash & unforeseen on set",
    ar: "نثريات ومصاريف طارئة بالموقع",
    unitEn: "shoot day",
    unitAr: "يوم تصوير",
    qty: (_a, d) => d.shootDays,
    rate: flat(600),
  },
  {
    key: "insurance",
    section: "other",
    en: "Production insurance",
    ar: "تأمين الإنتاج",
    unitEn: "% of budget",
    unitAr: "% من الميزانية",
    qty: flat(1),
    rate: flat(0),
    pct: (a) => a.insurancePct,
  },
  {
    key: "contingency",
    section: "other",
    en: "Contingency",
    ar: "احتياطي الطوارئ",
    unitEn: "% of budget",
    unitAr: "% من الميزانية",
    qty: flat(1),
    rate: flat(0),
    pct: (a) => a.contingencyPct,
  },
];

// ------------------------------------------------------------
// Lines
// ------------------------------------------------------------

export interface EstimateLine {
  id: string;
  /** Rate-card key, `ai_*` for a model-proposed line, `user_*` for a typed one. */
  key: string;
  section: string;
  description: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number;
  /** Percentage of the rest of the sheet, when this line is a percentage line. */
  pct?: number;
  /** The working — "55 shoot days × 4,500". */
  basis: string;
  /** Why the line is on the sheet at all, when the card explains itself. */
  why?: string;
  source: "card" | "ai" | "user";
}

/** A line the model proposed because the treatment named something specific. */
export interface ExtraEstimateLine {
  key: string;
  section: string;
  description: string;
  unit: string;
  qty: number;
  /** In the project's currency already — the model is told the currency. */
  rate: number;
  why?: string;
}

/** A user's edits, keyed by line key so they survive an assumption change. */
export type EstimateOverrides = Record<
  string,
  {
    qty?: number;
    rate?: number;
    /** A typed-over total. Wins over qty × rate, and stops recomputation. */
    amount?: number;
    section?: string;
    description?: string;
    removed?: boolean;
  }
>;

function fmtNum(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

/**
 * Assumptions (+ extras, + the user's edits) → the estimate.
 *
 * Percentage lines are computed last, over the sum of everything else, so
 * contingency follows the sheet it is contingency for. A user-overridden amount
 * is included in that base — if someone types the real insurance quote in, the
 * contingency should be a contingency on what the production actually costs.
 */
export function estimateBudget(
  a: EstimateAssumptions,
  extras: ExtraEstimateLine[] = [],
  overrides: EstimateOverrides = {}
): EstimateLine[] {
  const d = derive(a);
  const tier = TIER_MULTIPLIER[a.tier] ?? 1;
  const scale = a.rateScale > 0 ? a.rateScale : 1;

  const lines: EstimateLine[] = [];

  for (const item of RATE_CARD) {
    const ov = overrides[item.key];
    if (ov?.removed) continue;

    const cardQty = Math.max(0, Math.round(item.qty(a, d)));
    const qty = ov?.qty ?? cardQty;
    // Zero quantity means the production doesn't do this thing (no aerial days,
    // no stunts) — the line is dropped rather than shown at nil, unless the
    // user put a quantity on it themselves.
    if (!item.pct && qty <= 0) continue;

    const cardRate = round(item.rate(a, d) * tier * scale);
    const rate = ov?.rate ?? cardRate;
    const pct = item.pct ? (overrides[item.key]?.rate ?? item.pct(a)) : undefined;

    lines.push({
      id: id("est"),
      key: item.key,
      section: ov?.section ?? item.section,
      description: ov?.description ?? item.en,
      unit: item.unitEn,
      qty,
      rate: item.pct ? (pct ?? 0) : rate,
      amount: ov?.amount ?? (item.pct ? 0 : round(qty * rate)),
      pct: item.pct ? pct : undefined,
      basis: item.pct
        ? `${pct ?? 0}% of the sheet`
        : `${fmtNum(qty)} × ${fmtNum(rate)} ${a.currency}`,
      why: item.whyEn,
      source: "card",
    });
  }

  for (const extra of extras) {
    const ov = overrides[extra.key];
    if (ov?.removed) continue;
    const qty = ov?.qty ?? Math.max(0, Math.round(extra.qty));
    const rate = ov?.rate ?? round(extra.rate);
    lines.push({
      id: id("est"),
      key: extra.key,
      section: ov?.section ?? extra.section,
      description: ov?.description ?? extra.description,
      unit: extra.unit,
      qty,
      rate,
      amount: ov?.amount ?? round(qty * rate),
      basis: `${fmtNum(qty)} × ${fmtNum(rate)} ${a.currency}`,
      why: extra.why,
      source: extra.key.startsWith("user_") ? "user" : "ai",
    });
  }

  // Percentage lines, over everything else.
  const base = lines.filter((l) => l.pct === undefined).reduce((s, l) => s + l.amount, 0);
  for (const line of lines) {
    if (line.pct === undefined) continue;
    const ov = overrides[line.key];
    line.amount = ov?.amount ?? round((base * line.pct) / 100);
  }

  // Section order follows the top sheet, not the card's declaration order, so a
  // user-added line lands with its own department rather than at the bottom.
  const order = new Map(BUDGET_SECTIONS.map((s, i) => [s.id, i]));
  return lines.sort((x, y) => (order.get(x.section) ?? 99) - (order.get(y.section) ?? 99));
}

function round(n: number): number {
  return Math.round(Number.isFinite(n) ? n : 0);
}

export function estimateTotal(lines: EstimateLine[]): number {
  return lines.reduce((s, l) => s + l.amount, 0);
}

export function estimateBySection(lines: EstimateLine[]): { section: string; total: number }[] {
  const map = new Map<string, number>();
  for (const l of lines) map.set(l.section, (map.get(l.section) ?? 0) + l.amount);
  const order = new Map(BUDGET_SECTIONS.map((s, i) => [s.id, i]));
  return [...map.entries()]
    .map(([section, total]) => ({ section, total }))
    .sort((a, b) => (order.get(a.section) ?? 99) - (order.get(b.section) ?? 99));
}

/** Arabic descriptions, when the treatment was Arabic. */
export function localizeLines(lines: EstimateLine[], lang: ScriptLanguage): EstimateLine[] {
  if (lang !== "ar") return lines;
  const card = new Map(RATE_CARD.map((i) => [i.key, i]));
  return lines.map((l) => {
    const item = card.get(l.key);
    if (!item) return l;
    return {
      ...l,
      description: l.source === "card" ? item.ar : l.description,
      unit: item.unitAr,
      why: item.whyAr ?? l.why,
    };
  });
}

// ------------------------------------------------------------
// Profile → assumptions
// ------------------------------------------------------------

/**
 * The treatment's read → a first set of assumptions.
 *
 * Every default here is derived from something the treatment said, because a
 * default nobody can trace is a number the user has to re-derive before they
 * can trust the sheet. Shoot days come from runtime (a minute a day per ten
 * minutes of screen time is the regional drama rate) plus a day when the story
 * is action-heavy; crew size comes from the tier; extras come from the crowd
 * score.
 */
export function profileToAssumptions(
  profile: TreatmentProfile,
  currency: string,
  overrides: Partial<EstimateAssumptions> = {}
): EstimateAssumptions {
  const loads = profile.loads;
  const format = profile.format;
  const episodes = format === "series" ? Math.max(1, profile.episodes) : 1;

  const baseDays = Math.max(2, Math.round(profile.episodeMinutes / 10));
  const shootDaysPerEpisode = baseDays + (loads.action >= 2 ? 1 : 0);
  const shootDays = episodes * shootDaysPerEpisode;

  const leads = profile.characters.filter((c) => c.billing === "lead").length || 2;
  const supporting = profile.characters.filter((c) => c.billing !== "lead").length || 3;

  const crewSize = 40 + (loads.action >= 2 ? 8 : 0) + (loads.crowd >= 2 ? 6 : 0);
  const extrasPerShootDay = [0, 8, 20, 40][clamp(loads.crowd, 0, 3)];
  const stuntDays =
    loads.stunts + loads.action === 0
      ? 0
      : Math.max(1, Math.round(shootDays * (0.06 * Math.max(loads.stunts, loads.action))));
  const aerialDays = loads.aerial === 0 ? 0 : Math.max(1, Math.round(shootDays * 0.03 * loads.aerial));
  const vfxShots = [0, 15, 45, 120][clamp(loads.vfx, 0, 3)] * (format === "series" ? Math.max(1, episodes / 6) : 1);

  return {
    title: profile.title ?? "Untitled production",
    currency,
    format,
    episodes,
    episodeMinutes: profile.episodeMinutes,
    shootDaysPerEpisode,
    // Prep scales with the shoot; post with the number of episodes to finish.
    prepWeeks: Math.max(3, Math.round(shootDays / 8)),
    postWeeks: Math.max(4, Math.round((format === "series" ? episodes * 1.5 : 10))),
    studioDayPct: loads.period >= 2 ? 25 : 15,
    crewSize,
    castLeads: leads,
    castSupporting: supporting,
    castDayPlayers: Math.max(2, Math.round(episodes * 1.5)),
    extrasPerShootDay,
    stuntDays,
    aerialDays,
    vfxShots: Math.round(vfxShots),
    travelDays: 0,
    periodDual: loads.period >= 3,
    nightShootPct: [5, 15, 25, 35][clamp(loads.night, 0, 3)],
    tier: "standard",
    rateScale: defaultRateScale(currency),
    contingencyPct: 10,
    insurancePct: 2,
    ...overrides,
  };
}

// ------------------------------------------------------------
// Estimate → store records
// ------------------------------------------------------------

/**
 * The day rate the estimate priced a part at.
 *
 * Used when the treatment's characters are added to the cast list, so a cast
 * card opens carrying the same rate the budget was built on instead of a zero
 * that quietly contradicts the top sheet.
 */
export function castDayRate(a: EstimateAssumptions, billing: Billing): number {
  const base = billing === "lead" ? 6000 : billing === "supporting" ? 2500 : 1500;
  return Math.round(base * (TIER_MULTIPLIER[a.tier] ?? 1) * (a.rateScale > 0 ? a.rateScale : 1));
}

/**
 * Estimate lines → `BudgetLine`s.
 *
 * Codes are synthesized per section (1000, 1010, …) because an estimate has no
 * chart of accounts to preserve — unlike an imported sheet, where the file's
 * own numbering is the thing that must survive (`budgetImport.toBudgetLines`).
 * `committed`/`spent` start at zero: nothing has been ordered or paid on a
 * budget that was estimated five minutes ago.
 */
export function estimateToBudgetLines(lines: EstimateLine[], lang: ScriptLanguage): BudgetLine[] {
  const perSection = new Map<string, number>();
  return lines
    .filter((l) => l.amount > 0)
    .map((l) => {
      const idx = (perSection.get(l.section) ?? 0) + 1;
      perSection.set(l.section, idx);
      const sectionIndex = BUDGET_SECTIONS.findIndex((s) => s.id === l.section);
      const code = String((sectionIndex + 1) * 1000 + idx * 10);
      return {
        id: l.id,
        code,
        category: sectionLabel(l.section, lang),
        subcategory: l.qty > 1 ? `${l.qty} × ${l.unit}` : undefined,
        department: sectionDepartment(l.section),
        description: l.description,
        budgeted: l.amount,
        committed: 0,
        spent: 0,
      };
    });
}
