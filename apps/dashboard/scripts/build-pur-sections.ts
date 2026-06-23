// Build the committed PUR-by-section fixture from a CA DPR Pesticide Use Reporting (PUR) annual
// archive. PUR is the mandatory statewide pesticide-use database; the finest spatial unit is the
// 1-square-mile PLSS SECTION (COMTRS), never an APN - so the parcel drawer shows "reported
// applications in this parcel's section", honestly section-level.
//
//   How to refresh (offline; the archive is ~160-260 MB so we do NOT fetch at build/runtime):
//     1) curl -o /tmp/pur.zip https://files.cdpr.ca.gov/pub/outgoing/pur_archives/pur2022.zip
//     2) unzip -o /tmp/pur.zip 'ftp_files/udc22_10.txt' 'ftp_files/chemical.txt' \
//          'ftp_files/site.txt' 'ftp_files/county.txt' -d /tmp
//     3) npx tsx scripts/build-pur-sections.ts            (reads /tmp/ftp_files, writes the fixture)
//
// Bounded to Fresno County (code 10, where the Batth demo farm sits) to keep the committed fixture
// small; add more county files (udcYY_NN.txt) to COUNTIES to widen coverage. Aggregates per COMTRS:
// total lbs of active ingredient, top chemicals, application-record count, top crops/sites.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC_DIR = process.env.PUR_SRC_DIR ?? "/tmp/ftp_files";
const YEAR = 2022;
const YY = "22";
// CDPR county code -> our udc file. Fresno only for now (the demo farm's county).
const COUNTIES = [{ code: "10", file: `udc${YY}_10.txt` }];
const TOP_CHEMICALS = 6;
const TOP_CROPS = 4;

/** Split one CSV line (PUR files are simple comma-delimited with occasional "" quotes). */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function loadLookup(file: string, keyCol: number, valCol: number): Map<string, string> {
  const map = new Map<string, string>();
  const text = readFileSync(join(SRC_DIR, file), "utf8");
  const lines = text.split("\n");
  for (let i = 1; i < lines.length; i += 1) {
    const f = splitCsv((lines[i] ?? "").replace(/\r$/, ""));
    const k = (f[keyCol] ?? "").trim();
    const v = (f[valCol] ?? "").trim();
    if (k) map.set(k, v);
  }
  return map;
}

type SectionAgg = {
  records: number;
  lbs: number;
  chem: Map<string, number>; // chemName -> lbs
  crops: Map<string, number>; // siteName -> count
};

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function main(): void {
  const chemNames = loadLookup("chemical.txt", 0, 2); // chem_code -> chemname
  const siteNames = loadLookup("site.txt", 0, 1); // site_code -> site_name
  const sections = new Map<string, SectionAgg>();

  for (const county of COUNTIES) {
    const text = readFileSync(join(SRC_DIR, county.file), "utf8");
    const lines = text.split("\n");
    const hdr = splitCsv((lines[0] ?? "").replace(/\r$/, ""));
    const iChem = hdr.indexOf("chem_code");
    const iLbs = hdr.indexOf("lbs_chm_used");
    const iSite = hdr.indexOf("site_code");
    const iComtrs = hdr.indexOf("comtrs");
    const iErr = hdr.findIndex((h) => h.replace(/\r$/, "") === "error_flag");
    for (let i = 1; i < lines.length; i += 1) {
      const raw = lines[i];
      if (!raw) continue;
      const f = splitCsv(raw.replace(/\r$/, ""));
      const comtrs = (f[iComtrs] ?? "").trim();
      if (!comtrs || comtrs.length < 8) continue; // skip summary/un-located rows
      if (iErr >= 0 && (f[iErr] ?? "").trim() !== "") continue; // drop error/outlier-flagged rows
      const lbs = Number(f[iLbs]);
      const lbsOk = Number.isFinite(lbs) && lbs > 0;
      let agg = sections.get(comtrs);
      if (!agg) {
        agg = { records: 0, lbs: 0, chem: new Map(), crops: new Map() };
        sections.set(comtrs, agg);
      }
      agg.records += 1;
      if (lbsOk) {
        agg.lbs += lbs;
        const chem = titleCase(chemNames.get((f[iChem] ?? "").trim()) ?? "Other");
        agg.chem.set(chem, (agg.chem.get(chem) ?? 0) + lbs);
      }
      const crop = titleCase(siteNames.get((f[iSite] ?? "").trim()) ?? "");
      if (crop) agg.crops.set(crop, (agg.crops.get(crop) ?? 0) + 1);
    }
  }

  const round = (n: number): number => Math.round(n * 10) / 10;
  const out: Record<string, unknown> = {};
  for (const [comtrs, a] of sections) {
    const topChem = [...a.chem.entries()].sort((x, y) => y[1] - x[1]).slice(0, TOP_CHEMICALS);
    const topCrops = [...a.crops.entries()].sort((x, y) => y[1] - x[1]).slice(0, TOP_CROPS).map((c) => c[0]);
    out[comtrs] = {
      records: a.records,
      lbs: round(a.lbs),
      top_chemicals: topChem.map(([name, lbs]) => ({ name, lbs: round(lbs) })),
      top_crops: topCrops,
    };
  }

  const payload = { source: "CA DPR Pesticide Use Reporting (PUR)", year: YEAR, granularity: "PLSS section (COMTRS)", sections: out };
  const dest = join(process.cwd(), "fixtures", `pur-sections.json`);
  writeFileSync(dest, JSON.stringify(payload));
  console.log(`PUR ${YEAR}: ${Object.keys(out).length} sections aggregated -> ${dest}`);
}

main();
