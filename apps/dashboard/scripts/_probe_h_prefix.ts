// TEMP probe: verify the h-prefix-drops-131-ag-meters finding against the REAL
// export rate codes + the PRODUCTION rate card + the PRODUCTION mapScheduleLabel.
import { mapScheduleLabel, planFromLabel } from "@/lib/energy/rate-lever";
import { loadRateCard } from "@/lib/pge/rate-card";

const card = loadRateCard();

// The 21 distinct Rate Code values from the two real Batth exports, with SA counts.
const REAL: Array<[string, number]> = [
  ["HAGC", 85],
  ["HAGA2", 19],
  ["HAGA1", 14],
  ["AG5B", 14],
  ["HAGB", 12],
  ["HE1", 12],
  ["AGC", 10],
  ["AG5C", 9],
  ["AGB", 6],
  ["HB1", 5],
  ["HETOUC", 3],
  ["B1", 3],
  ["A1X", 3],
  ["HE1N", 2],
  ["HEM", 2],
  ["AG4C", 2],
  ["HAGFB", 2],
  ["HAG5B", 1],
  ["HETOUCN", 1],
  ["HB6", 1],
  ["E19P", 1],
];

// AG codes by inspection: anything containing "AG".
const isAg = (c: string) => /AG/.test(c);

function run(billedMaxKw: number | null, label: string) {
  console.log(`\n===== mapScheduleLabel with billedMaxKw=${label} =====`);
  let mappedSa = 0;
  let unmappedSa = 0;
  let agUnmappedSa = 0;
  for (const [code, n] of REAL) {
    const m = mapScheduleLabel(code, card, billedMaxKw);
    const sched = m?.plan.schedule ?? null;
    const tier = m?.realTier ?? null;
    const tag = m ? "MAPPED  " : "UNMAPPED";
    const ag = isAg(code) ? "[AG]" : "    ";
    console.log(`  ${tag} ${ag} ${code.padEnd(9)} SAs=${String(n).padStart(3)} -> ${sched ?? "NULL"}${tier ? ` (realTier=${tier})` : ""}`);
    if (m) mappedSa += n;
    else {
      unmappedSa += n;
      if (isAg(code)) agUnmappedSa += n;
    }
  }
  console.log(`  --- mapped SAs=${mappedSa}  unmapped SAs=${unmappedSa}  (AG codes that fell to NULL: ${agUnmappedSa} SAs)`);
}

run(null, "null (winter-only / unknown demand)");
run(200, "200 (large pump)");

// Sanity: confirm the card actually HAS the AG families we'd map H-prefixed codes to.
console.log("\n===== production card AG plans =====");
for (const p of card.plans.filter((x) => x.family.startsWith("AG"))) {
  console.log(`  ${p.schedule.padEnd(8)} family=${p.family.padEnd(6)} size=${p.sizeClass} legacy=${p.legacy} ag=${p.agricultural}`);
}
console.log("\ncard families:", [...new Set(card.plans.map((p) => p.family))].join(", "));

// And the bare (non-H) equivalents to prove the ONLY difference is the H prefix.
console.log("\n===== bare vs H-prefixed (proves it's the H, not the family) =====");
for (const code of ["AGC", "HAGC", "AGA2", "HAGA2", "AGA1", "HAGA1", "AGB", "HAGB", "AG5B", "HAG5B", "HAGFB"]) {
  const sched = planFromLabel(code, card, null)?.schedule ?? "NULL";
  console.log(`  ${code.padEnd(8)} -> ${sched}`);
}
