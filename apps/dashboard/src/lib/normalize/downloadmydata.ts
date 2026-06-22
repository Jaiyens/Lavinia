// PG&E "Download My Data" / Share My Data usage export -> NormalizedMeter[].
//
// This is the LOAD layer: 15-minute interval kWh per meter, usage only (no dollars).
// PG&E offers two flavors and this mapper handles both:
//   - CSV  (the one-time historical download): a wide tabular file keyed on
//     Account ID + Service Agreement ID, one row per 15-minute interval, with a
//     Direction of Energy column (D = delivered/import, R = received/export) and a
//     TOU Code column. This is the fully-featured path.
//   - Green Button XML (ESPI): delegated to normalizeEspi. The standard ESPI usage
//     feed does not surface a per-interval flow direction here, so XML intervals land
//     as import-only for now (see normalizeDownloadMyDataXml).
//
// Identity mirrors the rest of the normalize layer: serviceId is the SA ID the
// importer upserts on; meterSerial and accountNumber are carried so the importer can
// resolve one Account per PG&E account number (the multi-account Batth path). Because
// the file has no billed dollars, `summaries` is always empty: a usage-only meter
// lands its UsageIntervals and stays coverageState "no_bill" until a bill reconciles.
//
// Pure: takes file text, returns typed meters. No IO, no DB.

import type { IntervalReading } from "@/lib/energy/types";
import { parseCsv } from "@/lib/spreadsheet/parse";
import { normalizeEspi } from "./espi";
import type { NormalizedMeter } from "./types";

/** Canonical export field -> the normalized header spellings PG&E uses for it. */
const COLUMNS = {
  account: ["accountid", "account", "accountnumber"],
  serviceId: ["serviceagreementid", "said", "serviceid"],
  meter: ["meterbadgenumber", "meterbadge", "meter", "meterserial", "meternumber"],
  rate: ["ratecode", "rate", "rateschedule", "tariff"],
  date: ["date"],
  time: ["time"],
  usageHour: ["usagehour", "hour"],
  intervalNumber: ["intervalnumber", "interval"],
  intervalLen: ["intervallength", "intervallen"],
  tou: ["toucode", "tou"],
  direction: ["directionofenergy", "direction", "flowdirection"],
  uom: ["unitofmeasure", "uom", "unit"],
  usage: ["usagevalue", "usage", "kwh"],
  dst: ["daylightsavingsflag", "daylightsaving", "dstflag", "dst"],
} as const;

type Field = keyof typeof COLUMNS;

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cleanText(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

function toNumber(v: string | undefined): number | null {
  const t = cleanText(v);
  if (t === null) return null;
  const n = Number(t.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * PG&E reports interval length in MINUTES in the CSV (15), but ESPI/Green Button uses
 * SECONDS (900). Normalize both to seconds; treat a value < 60 as minutes. Defaults to
 * 900 (15 min) when the column is absent or unparseable.
 */
function toDurationSec(v: string | undefined): number {
  const n = toNumber(v);
  if (n === null || n <= 0) return 900;
  return n < 60 ? Math.round(n * 60) : Math.round(n);
}

/** D = delivered (to customer) = import; R / Received / ESPI flowDirection 19 = export. */
function toDirection(v: string | undefined): "import" | "export" {
  const t = (v ?? "").trim().toUpperCase();
  return t === "R" || t === "RECEIVED" || t === "19" ? "export" : "import";
}

/** PG&E flags daylight time per interval: "Y" = PDT (UTC-7), "N"/blank = PST (UTC-8). */
function offsetHours(dst: string | undefined): number {
  return (dst ?? "").trim().toUpperCase().startsWith("Y") ? -7 : -8;
}

/** Parse "YYYY-MM-DD" + a time cell ("HH:MM" or "YYYY-MM-DD HH:MM") into wall components. */
function parseWall(
  dateStr: string | null,
  timeStr: string | null,
): { y: number; mo: number; d: number; hh: number; mm: number } | null {
  const full = (timeStr ?? "").trim().match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
  if (full) {
    return { y: +full[1]!, mo: +full[2]!, d: +full[3]!, hh: +full[4]!, mm: +full[5]! };
  }
  const date = (dateStr ?? "").trim().match(/(\d{4})-(\d{2})-(\d{2})/);
  const time = (timeStr ?? "").trim().match(/(\d{1,2}):(\d{2})/);
  if (!date) return null;
  return {
    y: +date[1]!,
    mo: +date[2]!,
    d: +date[3]!,
    hh: time ? +time[1]! : 0,
    mm: time ? +time[2]! : 0,
  };
}

/**
 * Compute the UTC instant for a local PG&E wall-clock time. `Date.UTC` treats the
 * components as if they were UTC; subtracting the (negative) offset corrects to the
 * real instant (e.g. 00:00 PST -> +8h -> 08:00Z). Extra minutes overflow cleanly, so
 * the caller can pass minutes-from-midnight via the minute argument.
 */
function wallToUtcMs(
  y: number,
  mo: number,
  d: number,
  hh: number,
  mm: number,
  offHours: number,
): number {
  return Date.UTC(y, mo - 1, d, hh, mm) - offHours * 3_600_000;
}

/** Locate the header row (PG&E prepends a title line) and index its columns by field. */
function indexColumns(grid: string[][]): { headerRow: number; idx: Map<Field, number> } | null {
  const serviceAliases = new Set<string>(COLUMNS.serviceId);
  const usageAliases = new Set<string>(COLUMNS.usage);
  let headerRow = -1;
  for (let r = 0; r < grid.length; r += 1) {
    const norm = new Set(grid[r]!.map(normHeader));
    const hasService = [...serviceAliases].some((a) => norm.has(a));
    const hasUsage = [...usageAliases].some((a) => norm.has(a));
    if (hasService && hasUsage) {
      headerRow = r;
      break;
    }
  }
  if (headerRow === -1) return null;

  const idx = new Map<Field, number>();
  grid[headerRow]!.forEach((raw, col) => {
    const key = normHeader(raw);
    for (const [field, aliases] of Object.entries(COLUMNS) as [Field, readonly string[]][]) {
      if (!idx.has(field) && aliases.includes(key)) {
        idx.set(field, col);
        break;
      }
    }
  });
  return { headerRow, idx };
}

/** One service point accumulated across its interval rows. */
type Accumulator = {
  serviceId: string;
  meterSerial: string | null;
  accountNumber: string | null;
  tariff: string | null;
  fuel: "electric" | "gas";
  /** Keyed `${startIso}|${direction}` so a duplicated row cannot violate the unique key. */
  readings: Map<string, IntervalReading>;
};

/**
 * Map a PG&E Download My Data CSV to normalized meters. Groups rows by Service
 * Agreement ID, converts each interval's local wall-clock time to a UTC start
 * (preferring the unambiguous Usage Hour + Interval Number when present, else the
 * Time column read as the interval end), and carries direction + TOU code per reading.
 */
export function normalizeDownloadMyDataCsv(csv: string): NormalizedMeter[] {
  const grid = parseCsv(csv);
  const located = indexColumns(grid);
  if (!located) return [];
  const { headerRow, idx } = located;

  const cell = (cells: string[], field: Field): string | undefined => {
    const col = idx.get(field);
    return col === undefined ? undefined : cells[col];
  };

  const byService = new Map<string, Accumulator>();

  for (let r = headerRow + 1; r < grid.length; r += 1) {
    const cells = grid[r]!;
    const serviceId = cleanText(cell(cells, "serviceId"));
    const usage = toNumber(cell(cells, "usage"));
    if (!serviceId || usage === null) continue;

    const durationSec = toDurationSec(cell(cells, "intervalLen"));
    const dst = cell(cells, "dst");
    const off = offsetHours(dst);

    // Prefer the unambiguous Usage Hour + Interval Number derivation (start = interval
    // start); fall back to the Time column read as the interval END (start = end - len).
    const usageHour = toNumber(cell(cells, "usageHour"));
    const intervalNumber = toNumber(cell(cells, "intervalNumber"));
    let startMs: number | null = null;
    const dateStr = cleanText(cell(cells, "date"));
    if (usageHour !== null && intervalNumber !== null && dateStr) {
      const dm = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (dm) {
        const minutes = (usageHour - 1) * 60 + (intervalNumber - 1) * (durationSec / 60);
        startMs = wallToUtcMs(+dm[1]!, +dm[2]!, +dm[3]!, 0, minutes, off);
      }
    }
    if (startMs === null) {
      const wall = parseWall(dateStr, cleanText(cell(cells, "time")));
      if (!wall) continue;
      const endMs = wallToUtcMs(wall.y, wall.mo, wall.d, wall.hh, wall.mm, off);
      startMs = endMs - durationSec * 1000;
    }

    const direction = toDirection(cell(cells, "direction"));
    const start = new Date(startMs).toISOString();
    const uom = cell(cells, "uom") ?? "";
    const fuel: "electric" | "gas" = /therm/i.test(uom) ? "gas" : "electric";

    let acc = byService.get(serviceId);
    if (!acc) {
      acc = {
        serviceId,
        meterSerial: cleanText(cell(cells, "meter")),
        accountNumber: cleanText(cell(cells, "account")),
        tariff: cleanText(cell(cells, "rate")),
        fuel,
        readings: new Map(),
      };
      byService.set(serviceId, acc);
    }
    // Fill identity fields from the first row that carries them.
    acc.meterSerial ??= cleanText(cell(cells, "meter"));
    acc.accountNumber ??= cleanText(cell(cells, "account"));
    acc.tariff ??= cleanText(cell(cells, "rate"));

    acc.readings.set(`${start}|${direction}`, {
      start,
      durationSec,
      kWh: usage,
      direction,
      touCode: cleanText(cell(cells, "tou")),
    });
  }

  const meters: NormalizedMeter[] = [];
  for (const acc of byService.values()) {
    const intervals = [...acc.readings.values()].sort((a, b) => a.start.localeCompare(b.start));
    meters.push({
      serviceId: acc.serviceId,
      meterSerial: acc.meterSerial,
      accountNumber: acc.accountNumber,
      fuel: acc.fuel,
      tariff: acc.tariff,
      address: null, // the usage export carries no service address
      intervals,
      summaries: [], // usage only: no dollars, so no per-cycle billing summary
    });
  }
  return meters;
}

/**
 * Map a PG&E Download My Data Green Button / ESPI XML feed. Delegates to the existing
 * ESPI normalizer. NOTE: the standard ESPI usage feed handled by greenbutton/parse.ts
 * does not yet surface a per-interval flow direction, so XML intervals land as
 * import-only; per-interval export (flowDirection 19) from XML is a follow-up. The CSV
 * path above is the one that carries Direction of Energy today.
 */
export function normalizeDownloadMyDataXml(xml: string): NormalizedMeter[] {
  return normalizeEspi(xml);
}

/** Sniff CSV vs XML and dispatch. Defaults to CSV when the format is not obvious. */
export function normalizeDownloadMyData(
  content: string,
  opts?: { format?: "csv" | "xml" },
): NormalizedMeter[] {
  const head = content.trimStart().slice(0, 200).toLowerCase();
  const format = opts?.format ?? (head.startsWith("<?xml") || head.includes("<feed") ? "xml" : "csv");
  return format === "xml" ? normalizeDownloadMyDataXml(content) : normalizeDownloadMyDataCsv(content);
}
