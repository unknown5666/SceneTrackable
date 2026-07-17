/**
 * End-to-end check for Arabic scripts. Runs a real Arabic screenplay through
 * the same parser and the same live AI calls the app uses — not a
 * reimplementation — and asserts what the UI depends on:
 *
 *   1. the parser finds the scenes, with the right INT/EXT, location and time
 *   2. the language detector calls the script Arabic (this drives the filters)
 *   3. the AI answers in Arabic, and keeps its enums in English
 *
 * Point 3 is the one that regresses quietly: a model reading Arabic will
 * happily answer in English, and the breakdown then names cast the crew can't
 * find in the script.
 *
 *   npx tsx scripts/arabic-smoke.ts
 */
import { aiCharacterBible, aiBreakdownBatch, CATEGORY_LIST, MODEL } from "../src/lib/claude";
import { parseScreenplay, extractCharacters } from "../src/lib/script";
import { sceneLanguage, detectLanguage, hasArabic } from "../src/lib/lang";
import type { Scene } from "../src/types";

const SCRIPT = `
مشهد ١ - داخلي - مقهى شعبي - ليل

تجلس ليلى في الركن، أمامها فنجان قهوة بارد. يدخل كريم مبللاً بالمطر ويجلس أمامها.
النادل يقف على مسافة، يراقب في صمت.

ليلى
تأخرت.

كريم
أتأخر دائماً، تعرفين ذلك.

ليلى
لا تبرر.

من خلف زجاج النافذة، رجل بمعطف رمادي يراقبهما.

مشهد ٢ - خارجي - شارع مبلل - ليل

الرجل ذو المعطف الرمادي يتبعهما من بعيد. يخطو إلى الضوء فنرى وجهه أخيراً:
المحقق سامي. كلب ضال ينبح عليه فيتجاهله ويكمل طريقه.

سامي
(في جهاز اللاسلكي)
إنها تتحرك. تتجه شرقاً.

مشهد ٣ - داخلي - سيارة كريم - نهار

كريم يقود بسرعة. ليلى تمسك بمقبض الباب. يتحدث عن والدته زينب التي لا نراها أبداً.

كريم
كانت والدتي ستحبك.
`.trim();

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  console.log(`Model: ${MODEL}\n`);

  // ---- 1. PARSER ----
  console.log("PARSE");
  const scenes = parseScreenplay(SCRIPT);
  console.log(
    scenes
      .map((s) => `    ${s.number}. ${s.intExt} | ${s.location} | ${s.timeOfDay} | ${s.pages}pp`)
      .join("\n")
  );
  check("finds all three scenes", scenes.length === 3, `got ${scenes.length}`);
  check("scene numbers normalize to ASCII", scenes.map((s) => s.number).join(",") === "1,2,3",
    scenes.map((s) => s.number).join(","));
  check("داخلي → INT", scenes[0]?.intExt === "INT", scenes[0]?.intExt);
  check("خارجي → EXT", scenes[1]?.intExt === "EXT", scenes[1]?.intExt);
  check("ليل → NIGHT", scenes[0]?.timeOfDay === "NIGHT", scenes[0]?.timeOfDay);
  check("نهار → DAY", scenes[2]?.timeOfDay === "DAY", scenes[2]?.timeOfDay);
  check("location is the Arabic place", scenes[0]?.location.includes("مقهى"), scenes[0]?.location);
  check("scene body captured", (scenes[0]?.scriptText.length ?? 0) > 50);

  // ---- 2. LANGUAGE DETECTION (drives the filters) ----
  console.log("\nLANGUAGE");
  check("script detected as Arabic", sceneLanguage(scenes) === "ar");
  check("English script still detects as English",
    detectLanguage("INT. DINER - NIGHT\nMARIA slides into the booth.") === "en");
  check("a stray Arabic noun doesn't flip an English script",
    detectLanguage("INT. DINER - NIGHT\nMARIA meets a man called كريم at the counter.") === "en");

  // ---- 3. CUE FALLBACK ----
  console.log("\nCUE HEURISTIC (fallback when the AI pass is unavailable)");
  const cues = extractCharacters(scenes);
  console.log(`    ${cues.join(", ") || "(none)"}`);
  check("finds Arabic cues", cues.length > 0, `${cues.length} found`);
  check("finds ليلى", cues.includes("ليلى"));
  check("finds كريم", cues.includes("كريم"));
  check("rejects the slugline words", !cues.some((c) => c.includes("داخلي") || c.includes("خارجي")));

  // ---- 4. LIVE AI: CHARACTER BIBLE ----
  console.log("\nCHARACTER BIBLE (live)");
  const { characters } = await aiCharacterBible(SCRIPT, "المعطف الرمادي");
  for (const c of characters) {
    console.log(`    - ${c.name} [${c.importance}] ${c.speaking ? "speaking" : "non-speaking"}`);
  }
  check("returns characters", characters.length > 0, `${characters.length}`);
  check("names are in Arabic, not transliterated",
    characters.every((c) => hasArabic(c.name)),
    characters.filter((c) => !hasArabic(c.name)).map((c) => c.name).join(", ") || "all Arabic");
  check("importance stays an English enum",
    characters.every((c) => ["lead", "supporting", "minor", "background"].includes(c.importance)),
    [...new Set(characters.map((c) => c.importance))].join(", "));
  check("found ليلى", characters.some((c) => c.name.includes("ليلى")));

  // ---- 5. LIVE AI: BREAKDOWN ----
  console.log("\nBREAKDOWN (live)");
  const { proposals } = await aiBreakdownBatch(scenes as Scene[], {
    characterBible: characters,
    projectName: "المعطف الرمادي",
  });
  check("every scene came back", proposals.size === scenes.length, `${proposals.size}/${scenes.length}`);

  const allElements = [...proposals.values()].flatMap((p) => p.elements);
  for (const [num, p] of proposals) {
    console.log(`    scene ${num}: ${p.elements.length} elements — ${p.synopsis ?? "(no synopsis)"}`);
    console.log(`      ${p.elements.map((e) => `${e.name} [${e.category}]`).join(", ")}`);
  }
  check("element names are in Arabic",
    allElements.length > 0 && allElements.every((e) => hasArabic(e.name)),
    allElements.filter((e) => !hasArabic(e.name)).map((e) => e.name).join(", ") || "all Arabic");
  check("categories stay English enums",
    allElements.every((e) => CATEGORY_LIST.includes(e.category)),
    [...new Set(allElements.map((e) => e.category))].join(", "));
  check("synopses are in Arabic",
    [...proposals.values()].every((p) => !p.synopsis || hasArabic(p.synopsis)));

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nFATAL:", e.message);
  process.exit(1);
});
