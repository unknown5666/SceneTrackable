/**
 * Prints both schedule documents for the bundled production, so the table
 * builders can be checked against real data without a browser.
 *
 *   npx tsx scripts/schedule-export-test.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  SCHEDULE_EXPORTS,
  buildLocationScheduleTable,
  buildGeneralCalendarTable,
  locationScheduleSummary,
} from "../src/lib/scheduleExports";
import type { ProductionData } from "../src/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ?? join(__dirname, "..", "public", "mazraat-yadoo-3.json");
const data = JSON.parse(readFileSync(file, "utf8")).state as ProductionData;

const show = (label: string, table: { columns: string[]; rows: string[][] }, limit: number) => {
  console.log(`\n===== ${label} — ${table.rows.length} rows =====`);
  console.log(table.columns.join(" | "));
  console.log("-".repeat(100));
  for (const row of table.rows.slice(0, limit)) {
    console.log(row.map((c) => (c.length > 34 ? c.slice(0, 31) + "..." : c)).join(" | "));
  }
  if (table.rows.length > limit) console.log(`... ${table.rows.length - limit} more`);
};

show("LOCATION SCHEDULE", buildLocationScheduleTable(data), 20);
console.log("\n-- summary --");
for (const [k, v] of locationScheduleSummary(data)) console.log(`${k}: ${v}`);
show("GENERAL CALENDAR", buildGeneralCalendarTable(data), 12);

// Tail of the calendar, to confirm it runs through post-production.
const cal = buildGeneralCalendarTable(data);
console.log("\n-- last 4 calendar rows --");
for (const row of cal.rows.slice(-4)) console.log(row.join(" | "));

// The shoot window — this is where post overlaps principal photography, so
// these rows must read "تصوير + مونتاج", exactly as the source sheet writes it.
const shootRows = cal.rows.filter((r) => r[2].includes("Shoot"));
console.log(`\n-- calendar rows carrying a shoot day: ${shootRows.length} --`);
for (const row of shootRows.slice(0, 4)) console.log(row.join(" | "));
console.log("...");
for (const row of shootRows.slice(-2)) console.log(row.join(" | "));
const overlap = shootRows.filter((r) => r[2].includes("Post")).length;
console.log(`\nshoot days also in post: ${overlap} of ${shootRows.length}`);
const offDays = cal.rows.filter((r) => r[2].includes("Off Day")).length;
console.log(`prep rows: ${cal.rows.filter((r) => r[2].includes("Prep")).length}`);
console.log(`off rows: ${offDays}`);

console.log(`\nExports defined: ${SCHEDULE_EXPORTS.map((e) => e.id).join(", ")}`);
