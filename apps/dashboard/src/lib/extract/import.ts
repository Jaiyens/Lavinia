// The end-to-end bill import (Story 1.8): split -> classify -> extract -> normalize ->
// identity-checked join -> reconcile -> persist, run as a bounded-concurrency fan-out (not
// one 101-page call). `runExtraction` is the orchestration over an injected PageReader pair
// (Sonnet first, Opus on cent-gate failure - the documented cost lever); `persistExtraction`
// is the DB edge (explicit PrismaClient). Logging is redacted to { saId, pageType, reason } -
// never the gateway key, grower credentials, full bill bytes, or PII (AC5).
//
// This module is a DB edge, NOT a /app import (the no-raw-source-in-ui guard forbids
// @/lib/extract in screens); it is driven by the admin/dev runner script.

import { reconcileBill } from "@/lib/energy/reconcile";
import { type BillInventoryView, normalizeBill } from "@/lib/normalize/billing";
import { type NemInventoryView, normalizeNem } from "@/lib/normalize/nem";
import { normalizeSaId } from "@/lib/normalize/sa-id";
import type { CanonicalBill, CanonicalNemReconciliation } from "@/lib/normalize/types";
import type { CoverageState } from "@/lib/recommendations/types";
import type { PrismaClient } from "@prisma/client";
import {
  type NemReconciliation,
  type PageType,
  type PerSaChargeDetail,
  RawPageSchema,
} from "./schema";
import type { PageReader } from "./reader";
import { splitPdfPages } from "./split";

/** Redacted progress log: SA id + page type + reason only (AC5). Never bytes/keys/PII. */
export type ExtractLog = (event: {
  saId: string | null;
  pageType: PageType | null;
  reason: string;
}) => void;

const noopLog: ExtractLog = () => {};

export type RunExtractionOptions = {
  /** Primary (cheaper) reader, e.g. Sonnet. */
  reader: PageReader;
  /** Escalation reader, e.g. Opus; used to re-extract a charge-detail page that fails the gate. */
  escalateReader?: PageReader;
  /** Max pages in flight (bounded fan-out, NOT one 101-page call). */
  concurrency?: number;
  log?: ExtractLog;
};

export type NeedsReviewPage = {
  pageIndex: number;
  pageType: PageType | null;
  saId: string | null;
  reason: string;
};

export type ExtractionResult = {
  pages: number;
  accountNumber: string | null;
  accountPrintedTotalCents: number | null;
  /** Charge-detail bills, each period's coverageState set by the cent gate (Story 1.7). */
  bills: CanonicalBill[];
  /** NEM reconciliations, normalized + linked to their generating array. */
  nem: CanonicalNemReconciliation[];
  needsReview: NeedsReviewPage[];
  reconciledCount: number;
  escalatedCount: number;
};

/** One page's outcome, retaining the page bytes so a failed charge-detail can be re-extracted. */
type PageOutcome =
  | { ok: true; pageIndex: number; pageType: PageType; raw: unknown; bytes: Uint8Array }
  | { ok: false; pageIndex: number; pageType: PageType | null; saId: string | null; reason: string };

/** Read an saId off a raw object without trusting its shape (for needs_review labelling). */
function readSaId(raw: unknown): string | null {
  if (raw && typeof raw === "object" && "saId" in raw) {
    const value = (raw as { saId: unknown }).saId;
    return typeof value === "string" ? value : null;
  }
  return null;
}

/** Bounded-concurrency map: at most `limit` tasks in flight. */
async function boundedMap<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      // items is a dense array (pages from splitPdfPages); the cast avoids leaving a hole in
      // `results` (which a later `.filter(o.ok)` would dereference and crash on).
      results[index] = await fn(items[index] as T, index);
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker());
  await Promise.all(workers);
  return results;
}

/** Classify one page, pick its schema, extract, and Zod-validate. Never throws a wrong number. */
async function extractOnePage(
  bytes: Uint8Array,
  pageIndex: number,
  reader: PageReader,
): Promise<PageOutcome> {
  let pageType: PageType | null = null;
  try {
    pageType = await reader.classify(bytes, pageIndex); // AC1: classify before extraction
    const raw = await reader.extract(bytes, pageType);
    const parsed = RawPageSchema.safeParse(raw);
    if (parsed.success && parsed.data.pageType === pageType) {
      return { ok: true, pageIndex, pageType, raw: parsed.data, bytes };
    }
    const reason = parsed.success
      ? `classified ${pageType} but extracted ${parsed.data.pageType}`
      : parsed.error.message;
    return { ok: false, pageIndex, pageType, saId: readSaId(raw), reason };
  } catch (err) {
    return {
      ok: false,
      pageIndex,
      pageType,
      saId: null,
      reason: err instanceof Error ? err.message : "extraction failed",
    };
  }
}

/** True when any of the bill's periods did not reconcile to the cent (Story 1.7). */
function billNeedsReview(bill: CanonicalBill): boolean {
  return bill.periods.some((period) => period.coverageState !== "reconciled");
}

/**
 * Run the full extraction over a bill PDF: split, bounded-concurrency classify+extract on the
 * primary reader, normalize charge-detail/NEM to the canonical shape, reconcile to the cent, and
 * escalate any charge-detail page that fails the gate to the Opus reader (the cost lever). Returns
 * the reconciled canonical result; persistence is `persistExtraction`. Zero state mutated.
 */
export async function runExtraction(
  bytes: Uint8Array,
  options: RunExtractionOptions,
): Promise<ExtractionResult> {
  const { reader, escalateReader, concurrency = 6, log = noopLog } = options;

  let pages: Uint8Array[];
  try {
    pages = await splitPdfPages(bytes);
  } catch (err) {
    const reason = `could not read PDF: ${err instanceof Error ? err.message : "parse failed"}`;
    log({ saId: null, pageType: null, reason });
    return {
      pages: 0,
      accountNumber: null,
      accountPrintedTotalCents: null,
      bills: [],
      nem: [],
      needsReview: [{ pageIndex: 0, pageType: null, saId: null, reason }],
      reconciledCount: 0,
      escalatedCount: 0,
    };
  }

  const outcomes = await boundedMap(pages, concurrency, (pageBytes, index) =>
    extractOnePage(pageBytes, index, reader),
  );

  // Inventory (the identity-join target) is derived from the bill's own per-SA identifiers,
  // since the demo account's master spreadsheet is not loaded; in prod this is the spreadsheet
  // (an independent source), which is what makes the meter#/Pump-ID check meaningful (FR-4).
  const chargeDetails = outcomes
    .filter((o): o is Extract<PageOutcome, { ok: true }> => o.ok && o.pageType === "per_sa_charge_detail")
    .map((o) => ({ ...o, page: o.raw as PerSaChargeDetail }));
  const nemPages = outcomes
    .filter((o): o is Extract<PageOutcome, { ok: true }> => o.ok && o.pageType === "nem_reconciliation")
    .map((o) => ({ ...o, page: o.raw as NemReconciliation }));

  const billInventory: BillInventoryView = {
    meters: chargeDetails.map((c) => ({
      saId: normalizeSaId(c.page.saId).saId,
      meterSerial: c.page.meterNumber,
      growerPumpId: c.page.growerPumpId,
    })),
  };

  const bills: CanonicalBill[] = [];
  let escalatedCount = 0;
  for (const detail of chargeDetails) {
    let bill = reconcileBill(normalizeBill(detail.page, billInventory));
    // Cost lever (AC2): a charge-detail page that fails the cent gate is re-extracted on the
    // escalation (Opus) reader, then re-normalized and re-reconciled.
    if (billNeedsReview(bill) && escalateReader) {
      log({ saId: bill.saId, pageType: "per_sa_charge_detail", reason: "escalating to Opus" });
      const reExtracted = await extractOnePage(detail.bytes, detail.pageIndex, escalateReader);
      if (reExtracted.ok && reExtracted.pageType === "per_sa_charge_detail") {
        const retried = reconcileBill(normalizeBill(reExtracted.raw as PerSaChargeDetail, billInventory));
        escalatedCount += 1;
        bill = retried;
      }
    }
    const state = bill.periods[0]?.coverageState ?? "needs_review";
    log({ saId: bill.saId, pageType: "per_sa_charge_detail", reason: `coverage ${state}` });
    bills.push(bill);
  }

  // NEM: each solar SA is its own generating array (no separate spreadsheet array graph here).
  const nemInventory: NemInventoryView = {
    arrays: nemPages.map((n) => {
      const saId = normalizeSaId(n.page.saId).saId;
      return { arrayId: saId, arrayName: null, generatingSaId: saId, benefitingMeterSaIds: [saId] };
    }),
  };
  const nem = nemPages.map((n) => normalizeNem(n.page, nemInventory));

  // Account-level printed total (the breakdown / account summary figure).
  const accountSummary = outcomes.find(
    (o): o is Extract<PageOutcome, { ok: true }> => o.ok && o.pageType === "account_summary",
  );
  const accountRaw = accountSummary?.raw;
  const accountPrintedTotalCents =
    accountRaw && typeof accountRaw === "object" && "printedTotalCents" in accountRaw
      ? ((accountRaw as { printedTotalCents: unknown }).printedTotalCents as number)
      : null;
  const accountNumber =
    accountRaw && typeof accountRaw === "object" && "accountNumber" in accountRaw
      ? ((accountRaw as { accountNumber: unknown }).accountNumber as string | null)
      : null;

  const needsReview: NeedsReviewPage[] = outcomes
    .filter((o): o is Extract<PageOutcome, { ok: false }> => !o.ok)
    .map((o) => ({ pageIndex: o.pageIndex, pageType: o.pageType, saId: o.saId, reason: o.reason }));
  for (const nr of needsReview) log(nr);

  const reconciledCount = bills.filter((b) => !billNeedsReview(b)).length;

  return {
    pages: pages.length,
    accountNumber,
    accountPrintedTotalCents,
    bills,
    nem,
    needsReview,
    reconciledCount,
    escalatedCount,
  };
}

export type PersistOptions = {
  farmName: string;
  accountNumber: string;
  /** Real grower data is not a demo seed (project-context: a real connected farm is isDemo:false). */
  isDemo?: boolean;
  /**
   * Attach the extraction to an EXISTING farm (its id) instead of the standalone
   * `real-<accountNumber>` farm. The onboarding bill-upload path (C3) passes the operator's
   * already-created, already-owned farm so the bill lands on it (with its userId/people
   * intact) rather than spawning a second farm. Omit it for the admin/dev import scripts.
   */
  farmId?: string;
  /** Redacted progress log (same contract as runExtraction's). */
  log?: ExtractLog;
};

/**
 * Persist a reconciled extraction to the DB (AC1). Idempotent: the Farm/Account/Pump are upserted
 * and each BillingPeriod is upserted on @@unique([pumpId, start]) with its line items replaced, so
 * a re-run does not duplicate. Takes an explicit PrismaClient (project rule). Streams per SA.
 */
export async function persistExtraction(
  result: ExtractionResult,
  prisma: PrismaClient,
  options: PersistOptions,
): Promise<{ pumps: number; periods: number; lineItems: number }> {
  // Attach to the caller's existing farm when given (onboarding, C3) - never clobbering its
  // name/isDemo/userId - otherwise upsert the standalone real-<account> farm (dev/admin import).
  const farm = options.farmId
    ? await prisma.farm.upsert({
        where: { id: options.farmId },
        create: { id: options.farmId, name: options.farmName, isDemo: options.isDemo ?? false },
        update: {},
      })
    : await prisma.farm.upsert({
        where: { id: `real-${options.accountNumber}` },
        create: { id: `real-${options.accountNumber}`, name: options.farmName, isDemo: options.isDemo ?? false },
        update: { name: options.farmName, isDemo: options.isDemo ?? false },
      });
  const account = await prisma.account.upsert({
    where: { farmId_number: { farmId: farm.id, number: options.accountNumber } },
    create: { farmId: farm.id, number: options.accountNumber },
    update: {},
  });

  let pumps = 0;
  let periods = 0;
  let lineItems = 0;

  for (const bill of result.bills) {
    const meterState = bill.periods.every((p) => p.coverageState === "reconciled")
      ? "reconciled"
      : "needs_review";
    const pump = await prisma.pump.upsert({
      where: { farmId_serviceId: { farmId: farm.id, serviceId: bill.saId } },
      create: {
        farmId: farm.id,
        accountId: account.id,
        name: bill.saIdDescriptor ?? bill.saId,
        serviceId: bill.saId,
        meterSerial: bill.meterNumber,
        growerPumpId: bill.growerPumpId,
        rateSchedule: bill.periods[0]?.tariff ?? null,
        coverageState: meterState,
      },
      update: { meterSerial: bill.meterNumber, growerPumpId: bill.growerPumpId, coverageState: meterState },
    });
    pumps += 1;

    for (const period of bill.periods) {
      const start = new Date(period.start);
      const existing = await prisma.billingPeriod.findUnique({
        where: { pumpId_start: { pumpId: pump.id, start } },
      });
      if (existing) await prisma.billingPeriod.delete({ where: { id: existing.id } }); // replace (idempotent)
      const created = await prisma.billingPeriod.create({
        data: {
          pumpId: pump.id,
          start,
          close: new Date(period.close),
          cycleClose: period.cycleClose ? new Date(period.cycleClose) : null,
          printedTotalCents: period.printedTotalCents,
          tariff: period.tariff,
          source: "scanned_bill",
          billingLineItems: {
            create: period.lineItems.map((li) => ({
              kind: li.kind,
              label: li.label,
              amountCents: li.amountCents,
              quantity: li.quantity,
              unit: li.unit,
              rate: li.rate,
            })),
          },
        },
      });
      periods += 1;
      lineItems += period.lineItems.length;
      void created;
    }
  }

  // NEM generating SAs are solar meters. Their monthly charge pages are PARTIAL
  // (energy nets to the annual true-up), so downstream levers must see them as
  // solar or they will quote rate-switch dollars off customer/demand charges
  // alone. The SolarArray/NEMA allocation graph remains the recorded 1-8
  // deferral; isSolar + the NemPeriod rows below are the minimum honest signal.
  const solarSaIds = [
    ...new Set(
      result.nem
        .map((n) => normalizeSaId(n.generatingSaId).saId)
        .filter((saId) => saId !== ""),
    ),
  ];
  if (solarSaIds.length > 0) {
    await prisma.pump.updateMany({
      where: { farmId: farm.id, serviceId: { in: solarSaIds } },
      data: { isSolar: true },
    });
  }

  // Persist the printed NEM months (Story 3.4). The raw entries are messy by
  // nature: several statements per SA (monthly pages + the annual true-up's
  // 12-month series + chart pages that classified as NEM with zero months), the
  // same month repeated across statements with off-by-a-day starts AND
  // disagreeing numbers, and OCR-mangled dates. Merge per SA:
  // - an entry's authority is its count of PARSEABLE months (garbage rows must
  //   not buy rank), longest first - the annual series wins its months;
  // - month identity is the calendar month of the parsed start (real statements
  //   print 12-11/12-12/12-13 for one December);
  // - disagreeing duplicates are logged per SA, never silently eaten;
  // - rows are REPLACED per pump (re-extraction with corrected dates leaves no
  //   stale rows behind);
  // - unsalvageable rows are skipped, counted, and logged per SA - never
  //   fabricated, never fatal.
  const nemBySa = new Map<string, CanonicalNemReconciliation[]>();
  for (const entry of result.nem) {
    const saId = normalizeSaId(entry.generatingSaId).saId;
    if (saId === "") continue;
    const list = nemBySa.get(saId) ?? [];
    list.push(entry);
    nemBySa.set(saId, list);
  }
  for (const [saId, entries] of nemBySa) {
    const pump = await prisma.pump.findUnique({
      where: { farmId_serviceId: { farmId: farm.id, serviceId: saId } },
    });
    // A NEM page whose SA never appeared on a charge page has no meter row to
    // hang months on; leave it for the full NEM persistence pass (honest absence).
    if (!pump) continue;

    // Parse first, then rank: authority = parsed month count.
    let skipped = 0;
    let conflicts = 0;
    const parsedEntries = entries.map((entry) => {
      const months: { start: Date; close: Date; netKwh: number; amountCents: number }[] = [];
      for (const month of entry.months) {
        const start = parseNemDate(month.start);
        const close = parseNemDate(month.close);
        if (start === null || close === null || month.amountCents === null) {
          skipped += 1;
          continue;
        }
        months.push({ start, close, netKwh: month.netKwh, amountCents: month.amountCents });
      }
      return { entry, months };
    });

    const monthsByBucket = new Map<
      string,
      { start: Date; close: Date; netKwh: number; amountCents: number }
    >();
    for (const { months } of [...parsedEntries].sort((a, b) => b.months.length - a.months.length)) {
      for (const month of months) {
        // Identity = the calendar month of the start (UTC), absorbing the
        // off-by-a-day boundary drift between statement formats.
        const bucket = `${month.start.getUTCFullYear()}-${month.start.getUTCMonth()}`;
        const existing = monthsByBucket.get(bucket);
        if (existing === undefined) {
          monthsByBucket.set(bucket, month);
        } else if (
          Math.abs(existing.netKwh - month.netKwh) > 1 ||
          Math.abs(existing.amountCents - month.amountCents) > 100
        ) {
          conflicts += 1; // the higher-authority entry's numbers stand; disagreement is logged below
        }
      }
    }

    // Replace, not accrete: a re-import with corrected dates must leave no
    // stale rows for the sums to double-count.
    const rows = [...monthsByBucket.values()];
    await prisma.nemPeriod.deleteMany({ where: { pumpId: pump.id } });
    if (rows.length > 0) {
      await prisma.nemPeriod.createMany({
        data: rows.map((month) => ({ pumpId: pump.id, ...month })),
      });
    }

    // True-up facts: among the entries that print a settlement amount, the one
    // with the most parseable months is the annual statement (same authority
    // rule as the month merge - page order is not authority). Existing
    // date/month survive an entry that omits them; a true-up month printed on
    // a statement WITHOUT a settlement amount still persists (it is a fact).
    const settlementEntries = parsedEntries
      .filter((p) => p.entry.trueUpAmountCents !== null)
      .sort((a, b) => b.months.length - a.months.length);
    const settlement = settlementEntries[0]?.entry;
    const anyTrueUpMonth =
      entries.find((e) => e.trueUpMonth !== null)?.trueUpMonth ?? null;
    if (settlement !== undefined || anyTrueUpMonth !== null) {
      const parsedDate = settlement?.trueUpDate ? parseNemDate(settlement.trueUpDate) : null;
      await prisma.pump.update({
        where: { id: pump.id },
        data: {
          trueUpAmountCents: settlement?.trueUpAmountCents ?? pump.trueUpAmountCents,
          trueUpMonth: settlement?.trueUpMonth ?? anyTrueUpMonth ?? pump.trueUpMonth,
          trueUpDate: parsedDate ?? pump.trueUpDate,
        },
      });
    }

    if (skipped > 0 || conflicts > 0) {
      options.log?.({
        saId,
        pageType: "nem_reconciliation",
        reason: `NEM months: kept ${rows.length}, skipped ${skipped} unparseable, ${conflicts} disagreeing duplicates (higher-authority entry kept)`,
      });
    }
  }

  return { pumps, periods, lineItems };
}

/**
 * Parse a printed NEM date defensively. The scans yield OCR-mangled strings:
 * salvage a YYYY-MM-DD or a US MM/DD/YYYY anywhere in the string, reject
 * anything else ("-", "/2025", "/15/2024") and any date whose components do
 * not round-trip (so an OCR'd "2025-02-30" is rejected, never rolled into
 * March). Null = the row is skipped and counted, never guessed.
 */
export function parseNemDate(raw: string): Date | null {
  let y: number, mo: number, d: number;
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  const us = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (iso?.[1] && iso[2] && iso[3]) {
    y = Number(iso[1]);
    mo = Number(iso[2]);
    d = Number(iso[3]);
  } else if (us?.[1] && us[2] && us[3]) {
    y = Number(us[3]);
    mo = Number(us[1]);
    d = Number(us[2]);
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(date.getTime())) return null;
  // Round-trip check: an overflowing day (Feb 30) must not roll into March.
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

/** A JSON-safe view of the reconciled result for the committed fixture (no raw bytes, no PII). */
export function toFixture(result: ExtractionResult): {
  account: { number: string | null; printedTotalCents: number | null };
  reconciledCount: number;
  escalatedCount: number;
  pages: number;
  bills: CanonicalBill[];
  nem: CanonicalNemReconciliation[];
  needsReview: NeedsReviewPage[];
} {
  return {
    account: { number: result.accountNumber, printedTotalCents: result.accountPrintedTotalCents },
    reconciledCount: result.reconciledCount,
    escalatedCount: result.escalatedCount,
    pages: result.pages,
    bills: result.bills,
    nem: result.nem,
    needsReview: result.needsReview,
  };
}

/** A coverage tally for the operator's log (no PII). */
export function coverageTally(result: ExtractionResult): Record<CoverageState | "nem", number> {
  const tally: Record<CoverageState | "nem", number> = {
    reconciled: 0,
    needs_review: 0,
    no_bill: 0,
    nem: result.nem.length,
  };
  for (const bill of result.bills) {
    const state: CoverageState = bill.periods.every((p) => p.coverageState === "reconciled")
      ? "reconciled"
      : "needs_review";
    tally[state] += 1;
  }
  return tally;
}
