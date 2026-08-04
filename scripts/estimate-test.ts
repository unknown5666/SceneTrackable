// ============================================================
// TREATMENT → ESTIMATE, from plain Node.
//
//   npx tsx scripts/estimate-test.ts <treatment.txt> [currency]
//
// Prints what the text-only pass read out of the treatment (no AI — this is the
// floor the feature falls back to when the model is unreachable), the
// assumptions it seeds, and the resulting top sheet section by section.
//
// Same purpose as scripts/budget-test.ts: exercise the parser against a real
// document rather than only through the modal, so a regression in the Arabic
// reading shows up as a wrong episode count here instead of a wrong budget in
// front of a producer.
// ============================================================

import { readFileSync } from "node:fs";
import { parseTreatment, LOAD_KEYS } from "../src/lib/treatment";
import {
  derive,
  estimateBudget,
  estimateBySection,
  estimateTotal,
  profileToAssumptions,
} from "../src/lib/budgetEstimate";
import { sectionLabel } from "../src/lib/budgetImport";

const file = process.argv[2];
const currency = process.argv[3] ?? "AED";
if (!file) {
  console.error("usage: npx tsx scripts/estimate-test.ts <treatment.txt> [currency]");
  process.exit(1);
}

const text = readFileSync(file, "utf8");
const profile = parseTreatment(text);
const money = (n: number) =>
  `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)} ${currency}`;

console.log("=== READ ===");
console.log(`title            ${profile.title ?? "—"}`);
console.log(`format           ${profile.format}`);
console.log(`episodes         ${profile.episodes}`);
console.log(`minutes/episode  ${profile.episodeMinutes}`);
console.log(`language         ${profile.language}`);
console.log(`genres           ${profile.genres.join(", ") || "—"}`);
console.log(`loads            ${LOAD_KEYS.map((k) => `${k}=${profile.loads[k]}`).join("  ")}`);
console.log(`characters       ${profile.characters.length}`);
for (const c of profile.characters) console.log(`   ${c.billing.padEnd(11)} ${c.name}`);
console.log(`locations        ${profile.locations.length}`);
for (const l of profile.locations) console.log(`   ${l.name}${l.note ? `  (${l.note})` : ""}`);
console.log("evidence:");
for (const e of profile.evidence) console.log(`   · ${e}`);

const a = profileToAssumptions(profile, currency);
const d = derive(a);
console.log("\n=== ASSUMPTIONS ===");
console.log(
  `shoot days ${d.shootDays} (${a.shootDaysPerEpisode}/ep) · ${d.shootWeeks} weeks · prep ${a.prepWeeks}w · post ${a.postWeeks}w`
);
console.log(
  `crew ${a.crewSize} · leads ${a.castLeads} · supporting ${a.castSupporting} · extras/day ${a.extrasPerShootDay}`
);
console.log(
  `stunt days ${a.stuntDays} · aerial ${a.aerialDays} · vfx shots ${a.vfxShots} · period ${a.periodDual} · tier ${a.tier}`
);

const lines = estimateBudget(a);
const total = estimateTotal(lines);
console.log("\n=== TOP SHEET ===");
for (const s of estimateBySection(lines)) {
  console.log(`\n${sectionLabel(s.section, profile.language)} — ${money(s.total)}`);
  for (const l of lines.filter((x) => x.section === s.section)) {
    console.log(`   ${l.description.padEnd(42).slice(0, 42)} ${l.basis.padEnd(26)} ${money(l.amount)}`);
  }
}
console.log(`\nTOTAL ${money(total)}`);
if (a.format === "series") console.log(`PER EPISODE ${money(total / a.episodes)}`);
console.log(`PER SHOOT DAY ${money(total / d.shootDays)}`);
