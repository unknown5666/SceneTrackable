/**
 * Live smoke test for the GLM integration. Calls the real API through the same
 * functions the app uses — not a reimplementation — and asserts the parsed
 * shapes the UI depends on.
 *
 *   npx tsx scripts/glm-smoke.ts
 */
import {
  aiCharacterBible,
  aiBreakdownBatch,
  aiBreakdownScene,
  aiLocationBible,
  aiTaskProposals,
  aiScheduleDraft,
  aiDailyDigest,
  aiAskProduction,
  aiNarrateReport,
  BREAKDOWN_BATCH_SIZE,
  LOCATION_TYPES,
  TASK_PRIORITIES,
  MODEL,
} from "../src/lib/claude";
import { DEPARTMENTS } from "../src/data/schemas";
import { evaluateDeadline } from "../src/lib/deadlines";
import type { Scene } from "../src/types";

const SCRIPT = `
INT. DINER - NIGHT

MARIA slides into the booth opposite JAKE, who is nursing a cold coffee.
A WAITRESS hovers nearby, refilling a cup without a word.

MARIA
You're late.

JAKE
I'm always late, Mars.

MARIA
Don't call me that.

Through the rain-streaked window, a MAN IN A GREY COAT watches them.

EXT. RAIN-SLICK STREET - NIGHT

The man in the grey coat follows at a distance. He steps into the light and
we see his face properly for the first time: DETECTIVE HALLORAN.

HALLORAN
(into his radio)
She's on the move. Heading east.

DISPATCH (V.O.)
Copy that. Units standing by.

A stray DOG barks at him. He ignores it and keeps walking.

INT. JAKE'S CAR - MOVING - NIGHT

Jake drives too fast. Maria grips the door handle. He talks about his mother,
EDITH, who we never see.

JAKE
Ma would've liked you.
`.trim();

const SCENES: Scene[] = [
  {
    id: "s1",
    number: "1",
    intExt: "INT",
    location: "DINER",
    timeOfDay: "NIGHT",
    pages: 1.2,
    synopsis: "Maria confronts Jake.",
    scriptText:
      "MARIA slides into the booth opposite JAKE, nursing a cold coffee. A WAITRESS hovers. Through the window, a MAN IN A GREY COAT watches.",
  } as Scene,
  {
    id: "s2",
    number: "2",
    intExt: "EXT",
    location: "RAIN-SLICK STREET",
    timeOfDay: "NIGHT",
    pages: 0.8,
    synopsis: "Halloran tails them.",
    scriptText:
      "DETECTIVE HALLORAN follows in the rain, radios DISPATCH. A stray DOG barks at him.",
  } as Scene,
];

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  console.log(`Model: ${MODEL}\n`);

  // ---- CHARACTER BIBLE (the one the user called out) ----
  console.log("CHARACTER BIBLE");
  const { characters, result: cbResult } = await aiCharacterBible(SCRIPT, "The Grey Coat");
  console.log(
    `  returned ${characters.length} characters, ${cbResult.inputTokens} in / ${cbResult.outputTokens} out`
  );
  for (const c of characters) {
    console.log(
      `    - ${c.name} [${c.importance}] ${c.speaking ? "speaking" : "non-speaking"}${
        c.aliases?.length ? ` (aka ${c.aliases.join(", ")})` : ""
      }`
    );
  }
  const names = characters.map((c) => c.name.toUpperCase());
  const has = (n: string) => names.some((x) => x.includes(n));

  check("cast is non-empty", characters.length > 0);
  check("every character has a name", characters.every((c) => c.name.trim().length > 0));
  check("MARIA found", has("MARIA"));
  check("JAKE found", has("JAKE"));
  check("HALLORAN found", has("HALLORAN"));
  check(
    "importance is a valid enum",
    characters.every((c) => ["lead", "supporting", "minor", "background"].includes(c.importance))
  );
  check("speaking is a real boolean", characters.every((c) => typeof c.speaking === "boolean"));
  check("at least one speaking role", characters.some((c) => c.speaking));
  check("live call, not mock", cbResult.fromMock === false);
  check("tokens metered", cbResult.inputTokens > 0 && cbResult.outputTokens > 0);

  // Aliasing: "MAN IN A GREY COAT" resolves to Halloran; Maria/Mars are one person.
  const halloran = characters.find((c) => c.name.toUpperCase().includes("HALLORAN"));
  console.log(
    `  note: grey-coat alias handled = ${Boolean(
      halloran?.aliases?.some((a) => /grey coat/i.test(a))
    )}; Maria count = ${names.filter((n) => n.includes("MARIA")).length}`
  );

  // ---- BATCH BREAKDOWN ----
  console.log("\nBATCH BREAKDOWN");
  const { proposals, result: bdResult } = await aiBreakdownBatch(SCENES, {
    projectName: "The Grey Coat",
    characterBible: characters,
  });
  console.log(
    `  returned ${proposals.size} scene proposals, ${bdResult.inputTokens} in / ${bdResult.outputTokens} out`
  );
  for (const [num, p] of proposals) {
    const cast = p.elements.filter((e) => e.category === "cast").map((e) => e.name);
    console.log(
      `    scene ${num}: ${p.elements.length} elements, ${p.estimated_duration_minutes}min, cast=[${cast.join(
        ", "
      )}]`
    );
  }
  check("a proposal per scene", proposals.size === SCENES.length);
  // The check that matters: keys must be the app's own scene numbers, because
  // that is how every caller looks a proposal up.
  check(
    "proposals keyed by the app's scene numbers",
    SCENES.every((s) => proposals.has(s.number)),
    `keys=[${[...proposals.keys()].join(", ")}] expected=[${SCENES.map((s) => s.number).join(", ")}]`
  );
  check(
    "every scene has elements",
    [...proposals.values()].every((p) => p.elements.length > 0)
  );
  check(
    "every scene tagged cast",
    [...proposals.values()].every((p) => p.elements.some((e) => e.category === "cast"))
  );
  check(
    "cast names come from the bible",
    [...proposals.values()].every((p) =>
      p.elements
        .filter((e) => e.category === "cast")
        .every((e) => names.some((n) => n.includes(e.name.toUpperCase().split(" ").pop()!)))
    )
  );
  // Shoot time, not screen time: a ~1 page scene is tens of minutes, not 2.
  check(
    "durations are plausible shoot times (>=15 min)",
    [...proposals.values()].every(
      (p) => Number.isFinite(p.estimated_duration_minutes) && p.estimated_duration_minutes >= 15
    ),
    [...proposals.values()].map((p) => `${p.estimated_duration_minutes}min`).join(", ")
  );
  check("live call, not mock", bdResult.fromMock === false);

  // ---- LIGHT FEATURES (thinking disabled path) ----
  console.log("\nDAILY DIGEST (light)");
  const { digest, result: dgResult } = await aiDailyDigest(
    "SCHEDULE: day 3 of 20\nPAGES: 12.4 of 98 shot\nBUDGET: 220,000 of 1,400,000 spent\nOVERDUE TASKS: 2\nPENDING POs: 1\nCAST CONFLICTS: none"
  );
  console.log(`  ${digest.split("\n").length} lines, ${dgResult.outputTokens} out tokens`);
  console.log(digest.split("\n").map((l) => `    ${l}`).join("\n"));
  check("digest is non-empty", digest.trim().length > 0);
  check("live call, not mock", dgResult.fromMock === false);

  console.log("\nASK THE PRODUCTION (light)");
  const { answer, result: askResult } = await aiAskProduction(
    "Which scenes shoot at night?",
    JSON.stringify({ scenes: SCENES.map((s) => ({ number: s.number, timeOfDay: s.timeOfDay })) })
  );
  console.log(`    ${answer.replace(/\n/g, "\n    ")}`);
  check("answer is non-empty", answer.trim().length > 0);
  check("live call, not mock", askResult.fromMock === false);

  console.log("\nREPORT NARRATION (light)");
  const { narration, result: nrResult } = await aiNarrateReport(
    "Scene Status",
    ["Scene", "Pages", "Status"],
    [["1", "1.2", "Shot"], ["2", "0.8", "Not shot"]]
  );
  console.log(`    ${narration.replace(/\n/g, "\n    ")}`);
  check("narration is non-empty", narration.trim().length > 0);
  check("live call, not mock", nrResult.fromMock === false);

  // ---- SINGLE-SCENE BREAKDOWN ----
  console.log("\nSINGLE SCENE BREAKDOWN");
  const { proposal: single, result: ssResult } = await aiBreakdownScene(SCENES[0], {
    projectName: "The Grey Coat",
    characterBible: characters,
  });
  console.log(
    `  ${single.elements.length} elements, ${single.estimated_duration_minutes}min, synopsis=${Boolean(
      single.synopsis
    )}`
  );
  check("single scene has elements", single.elements.length > 0);
  check("single scene tagged cast", single.elements.some((e) => e.category === "cast"));
  check("single scene duration >= 15", single.estimated_duration_minutes >= 15);
  check("live call, not mock", ssResult.fromMock === false);

  // ---- LOCATION BIBLE ----
  console.log("\nLOCATION BIBLE");
  const { locations, result: locResult } = await aiLocationBible(
    SCRIPT,
    SCENES.map((s) => `${s.intExt}. ${s.location} - ${s.timeOfDay}`),
    "The Grey Coat"
  );
  for (const l of locations) {
    console.log(
      `    - ${l.name} [${l.type}] scenes=[${(l.sceneNumbers ?? []).join(", ")}]${
        l.aliases?.length ? ` (aka ${l.aliases.join(", ")})` : ""
      }`
    );
  }
  check("locations are non-empty", locations.length > 0);
  check("every location has a name", locations.every((l) => l.name.trim().length > 0));
  check(
    "type is a valid enum",
    locations.every((l) => (LOCATION_TYPES as readonly string[]).includes(l.type))
  );
  check("live call, not mock", locResult.fromMock === false);

  // ---- TASK PROPOSALS ----
  console.log("\nTASK PROPOSALS");
  const { tasks, result: tkResult } = await aiTaskProposals(
    `SHOOT DAYS:\nDay 1 — 2026-08-03 — DINER — scenes 1\nDay 2 — 2026-08-04 — RAIN-SLICK STREET — scenes 2\n\nLOCATIONS: DINER, RAIN-SLICK STREET\n\nELEMENTS BY DEPARTMENT:\ncast: Maria, Jake, Detective Halloran\nvehicles: Jake's car (picture car)\nanimals: stray dog\nprops: hero coffee cup, radio\n\nEXISTING TASKS: none`,
    "The Grey Coat"
  );
  for (const t of tasks.slice(0, 6)) {
    console.log(`    - [${t.department}/${t.priority}] ${t.title} — ${t.deadlineRule}`);
  }
  check("tasks are non-empty", tasks.length > 0);
  check("every task has a title", tasks.every((t) => t.title.trim().length > 0));
  check(
    "department is a valid enum",
    tasks.every((t) => (DEPARTMENTS as readonly string[]).includes(t.department))
  );
  check(
    "priority is a valid enum",
    tasks.every((t) => (TASK_PRIORITIES as readonly string[]).includes(t.priority))
  );
  // Assert against what the app's own evaluator accepts, not the prompt's
  // shorter description of it — `manual(...)` takes an optional offset too, and
  // a rule that resolves is a rule that works.
  const deadlineCtx = {
    shootDays: [
      { dayNumber: 1, date: "2026-08-03T09:00:00.000Z" },
      { dayNumber: 2, date: "2026-08-04T09:00:00.000Z" },
    ],
    locationLockDates: { diner: "2026-07-20T09:00:00.000Z", "rain-slick street": "2026-07-21T09:00:00.000Z" },
  } as never;
  const unresolvable = tasks.filter((t) => evaluateDeadline(t.deadlineRule, deadlineCtx) === null);
  check(
    "every deadline rule resolves to a real date",
    unresolvable.length === 0,
    unresolvable.length ? unresolvable.map((t) => t.deadlineRule).join(" | ") : "all resolved"
  );
  check("live call, not mock", tkResult.fromMock === false);

  // ---- SCHEDULE DRAFT ----
  console.log("\nSCHEDULE DRAFT");
  const { days, result: schResult } = await aiScheduleDraft(
    `START DATE: 2026-08-03\nTARGET PAGES PER DAY: 3\n\nSCENES:\n1 — INT DINER — NIGHT — 1.2 pages\n2 — EXT RAIN-SLICK STREET — NIGHT — 0.8 pages`,
    "The Grey Coat"
  );
  for (const d of days) {
    console.log(
      `    - Day ${d.dayNumber} ${d.date} @ ${d.location} scenes=[${d.sceneNumbers.join(", ")}] ${d.estimatedHours}h`
    );
  }
  check("days are non-empty", days.length > 0);
  check("day numbers start at 1 and are gapless", days.every((d, i) => d.dayNumber === i + 1));
  check("dates are ISO", days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date)));
  check(
    "only real scene numbers are placed",
    days.every((d) => d.sceneNumbers.every((n) => SCENES.some((s) => s.number === n))),
    days.flatMap((d) => d.sceneNumbers).join(", ")
  );
  check("hours are plausible", days.every((d) => d.estimatedHours > 0 && d.estimatedHours <= 16));
  check("live call, not mock", schResult.fromMock === false);

  // ---- FULL-SIZE BATCH (the real breakdown load) ----
  console.log(`\nFULL-SIZE BATCH (${BREAKDOWN_BATCH_SIZE} scenes — real breakdown load)`);
  const bigScenes: Scene[] = Array.from({ length: BREAKDOWN_BATCH_SIZE }, (_, i) => ({
    ...SCENES[i % 2],
    id: `b${i}`,
    number: String(i + 1),
  })) as Scene[];
  const { proposals: bigProps, result: bigResult } = await aiBreakdownBatch(bigScenes, {
    projectName: "The Grey Coat",
    characterBible: characters,
  });
  console.log(
    `  ${bigProps.size}/${BREAKDOWN_BATCH_SIZE} scenes, ${bigResult.inputTokens} in / ${bigResult.outputTokens} out`
  );
  check(
    `all ${BREAKDOWN_BATCH_SIZE} scenes returned and keyed correctly`,
    bigScenes.every((s) => bigProps.has(s.number)),
    `keys=[${[...bigProps.keys()].join(", ")}]`
  );
  check(
    "every scene tagged cast",
    [...bigProps.values()].every((p) => p.elements.some((e) => e.category === "cast"))
  );
  check("live call, not mock", bigResult.fromMock === false);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nSMOKE TEST THREW:", e);
  process.exit(1);
});
