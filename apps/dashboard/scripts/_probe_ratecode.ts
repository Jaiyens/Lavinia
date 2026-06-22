// TEMP probe: verify the "raw-codes-unpriceable" finding against BOTH rate paths.
import { familyOf, planFor } from "@/lib/energy/rates";
import { planFromLabel, mapScheduleLabel } from "@/lib/energy/rate-lever";
import { loadRateCard } from "@/lib/pge/rate-card";

const card = loadRateCard();

// The 21 distinct export codes + a few hyphenated controls + master-sheet codes.
const exportCodes = [
  "A1X","AG4C","AG5B","AG5C","AGB","AGC","B1","E19P","HAG5B","HAGA1","HAGA2",
  "HAGB","HAGC","HAGFB","HB1","HB6","HE1","HE1N","HEM","HETOUC","HETOUCN",
];
const controls = ["AG-C2","AG-A2","AG-B2","AG-4B","AG-5C"];

console.log("=== rates.ts familyOf + planFor (the rate-compare.ts / run.ts path) ===");
for (const code of [...exportCodes, ...controls]) {
  // planFor needs a sizeClass; try large (the worst case the finding cites).
  const fam = familyOf(code);
  const planLg = planFor(card, code, "large");
  const planSm = planFor(card, code, "small");
  console.log(
    `${code.padEnd(8)} familyOf=${fam.padEnd(8)} planFor(large)=${planLg?.schedule ?? "NULL"} planFor(small)=${planSm?.schedule ?? "NULL"}`,
  );
}

console.log("\n=== rate-lever.ts mapScheduleLabel + planFromLabel (the runRateLever / production lever path) ===");
for (const code of [...exportCodes, ...controls]) {
  const mappedLg = mapScheduleLabel(code, card, 100); // 100kW -> large tier
  const mappedSm = mapScheduleLabel(code, card, 10);  // 10kW  -> small tier
  console.log(
    `${code.padEnd(8)} map(100kW)=${mappedLg ? mappedLg.plan.schedule + "/realTier=" + mappedLg.realTier : "NULL"}  map(10kW)=${mappedSm ? mappedSm.plan.schedule : "NULL"}`,
  );
}

console.log("\n=== Which export codes are AGRICULTURAL (start with AG, ignoring H prefix)? ===");
for (const code of exportCodes) {
  const stripped = code.replace(/^H/, "");
  const isAgStart = code.toUpperCase().startsWith("AG"); // run.ts isAg() reads the RAW stored code
  const isAgStripped = stripped.toUpperCase().startsWith("AG");
  console.log(`${code.padEnd(8)} run.ts isAg(raw)=${isAgStart}  isAg(H-stripped)=${isAgStripped}`);
}
