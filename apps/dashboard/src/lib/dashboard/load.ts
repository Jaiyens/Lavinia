// The dashboard read edge. Resolves the dashboard farm (the real reconciled account when
// connected, else the badged representative seed) and projects its meters into a plain,
// canonical MeterView[] that the KPI strip (2.3), the meter table (2.4), and the meter drawer
// (2.5) all read. It reads Prisma only and returns plain serializable objects - no raw-source
// import, no derivation (rollups live in the pure kpi.ts). Takes an explicit PrismaClient.

import type { PrismaClient } from "@prisma/client";
import { dashboardFarm, demoFarm } from "@/lib/onboarding/farm";
import { centsFromDollars } from "@/lib/format/money";
import type {
  BillingLineItemKind,
  BillingLineItemUnit,
  CoverageState,
} from "@/lib/recommendations/types";

export type MeterLineItemView = {
  kind: BillingLineItemKind;
  label: string | null;
  amountCents: number;
  quantity: number | null;
  unit: BillingLineItemUnit | null;
  rate: number | null;
};

export type MeterPeriodView = {
  /** ISO 8601. */
  start: string;
  /** ISO 8601. */
  close: string;
  /** The SA printed total in integer cents; null until reconciled. */
  printedTotalCents: number | null;
  /** Demand charge in integer cents (from demand line items, else demandChargeUsd), or null. */
  demandCents: number | null;
  /** Total metered energy for the cycle in kWh; null when not on file. The per-cycle SUMMARY
   *  the cross-meter solar allocation reads (NFR4), never the 15-minute interval series. */
  totalKwh: number | null;
  peakKw: number | null;
  tariff: string | null;
  lineItems: MeterLineItemView[];
};

/** One printed NEM reconciliation month (Story 3.4), as persisted from the statement. */
export type MeterNemPeriodView = {
  /** ISO 8601. */
  start: string;
  /** ISO 8601. */
  close: string;
  /** Net metered kWh; negative = net export that month. */
  netKwh: number;
  /** Integer cents; negative = credit. */
  amountCents: number;
};

/** A solar array whose NEM credits offset this meter (the NEMA linkage, FR-10/AC2). */
export type MeterArrayView = {
  id: string;
  name: string | null;
  nameplateKw: number;
  nemType: string | null;
  trueUpMonth: number | null;
};

export type MeterView = {
  id: string;
  name: string;
  serviceId: string | null;
  rateSchedule: string | null;
  /** The bill's Service Information Serial letter (drives the scheduled cycle
   *  close via the 2026 read-schedule fixture); null until captured. Distinct
   *  from rotatingOutageBlock, which never drives cycle-close. */
  serialCode: string | null;
  isLegacy: boolean;
  /** Pump health read verbatim from the master sheet; null when unknown. */
  status: string | null;
  coverageState: CoverageState;
  accountNumber: string | null;
  ranchName: string | null;
  entityName: string | null;
  cropName: string | null;
  latitude: number | null;
  longitude: number | null;
  gpm: number | null;
  isSolar: boolean;
  nemType: string | null;
  /** NEM annual settle month (1-12); null when not on file. */
  trueUpMonth: number | null;
  /** Printed annual true-up amount, integer cents; null when not on file. */
  trueUpAmountCents: number | null;
  /** ISO 8601 date of the printed true-up statement; null when not on file. */
  trueUpDate: string | null;
  /** Paired array nameplate kW carried on the meter; null when not on file. */
  solarKw: number | null;
  /** Arrays whose credits offset this meter; empty when none on file. */
  benefitingArrays: MeterArrayView[];
  /** Printed NEM months, sorted by start ascending; empty when none persisted. */
  nemPeriods: MeterNemPeriodView[];
  growerPumpId: string | null;
  /** Sorted by start ascending. */
  periods: MeterPeriodView[];
};

export type DashboardData = {
  farm: { id: string; name: string };
  dataKind: "real" | "representative";
  meters: MeterView[];
};

const COVERAGE_STATES: readonly string[] = ["no_bill", "needs_review", "reconciled"];
const LINE_ITEM_KINDS: readonly string[] = ["tou_energy", "demand", "nbc", "other"];
const LINE_ITEM_UNITS: readonly string[] = ["kWh", "kW"];

function toCoverageState(s: string): CoverageState {
  return COVERAGE_STATES.includes(s) ? (s as CoverageState) : "no_bill";
}
function toLineItemKind(s: string): BillingLineItemKind {
  return LINE_ITEM_KINDS.includes(s) ? (s as BillingLineItemKind) : "other";
}
function toLineItemUnit(s: string | null): BillingLineItemUnit | null {
  return s !== null && LINE_ITEM_UNITS.includes(s) ? (s as BillingLineItemUnit) : null;
}

/** Project one farm's meters into the canonical MeterView shape. No farm-selection here. */
export async function loadMetersForFarm(
  prisma: PrismaClient,
  farmId: string,
): Promise<MeterView[]> {
  const pumps = await prisma.pump.findMany({
    where: { farmId },
    include: {
      account: { select: { number: true, entity: { select: { name: true } } } },
      ranch: { select: { name: true } },
      crop: { select: { name: true } },
      benefitingArrays: {
        select: { id: true, name: true, nameplateKw: true, nemType: true, trueUpMonth: true },
        orderBy: { name: "asc" },
      },
      billingPeriods: {
        include: { billingLineItems: true },
        orderBy: { start: "asc" },
      },
      nemPeriods: { orderBy: { start: "asc" } },
    },
    orderBy: { name: "asc" },
  });

  return pumps.map((pump) => ({
    id: pump.id,
    name: pump.name,
    serviceId: pump.serviceId,
    rateSchedule: pump.rateSchedule,
    serialCode: pump.serialCode,
    isLegacy: pump.isLegacy,
    status: pump.status,
    coverageState: toCoverageState(pump.coverageState),
    accountNumber: pump.account?.number ?? null,
    ranchName: pump.ranch?.name ?? null,
    entityName: pump.account?.entity?.name ?? null,
    cropName: pump.crop?.name ?? null,
    latitude: pump.latitude,
    longitude: pump.longitude,
    gpm: pump.gpm,
    isSolar: pump.isSolar,
    nemType: pump.nemType,
    trueUpMonth: pump.trueUpMonth,
    trueUpAmountCents: pump.trueUpAmountCents,
    trueUpDate: pump.trueUpDate ? pump.trueUpDate.toISOString() : null,
    solarKw: pump.solarKw,
    benefitingArrays: pump.benefitingArrays.map((arr) => ({
      id: arr.id,
      name: arr.name,
      nameplateKw: arr.nameplateKw,
      nemType: arr.nemType,
      trueUpMonth: arr.trueUpMonth,
    })),
    growerPumpId: pump.growerPumpId,
    nemPeriods: pump.nemPeriods.map((nem) => ({
      start: nem.start.toISOString(),
      close: nem.close.toISOString(),
      netKwh: nem.netKwh,
      amountCents: nem.amountCents,
    })),
    periods: pump.billingPeriods.map((period) => {
      // Prefer the demand-kind line items (integer cents, already reconciled). Distinguish
      // "demand lines present" (sum them, even if 0) from "no demand lines" (fall back to the
      // legacy float demandChargeUsd, else null) so a genuine zero is not conflated with absence.
      const demandLines = period.billingLineItems.filter((li) => li.kind === "demand");
      const demandCents =
        demandLines.length > 0
          ? demandLines.reduce((acc, li) => acc + li.amountCents, 0)
          : period.demandChargeUsd != null
            ? centsFromDollars(period.demandChargeUsd)
            : null;
      return {
        start: period.start.toISOString(),
        close: period.close.toISOString(),
        printedTotalCents: period.printedTotalCents,
        demandCents,
        totalKwh: period.totalKwh,
        peakKw: period.peakKw,
        tariff: period.tariff,
        lineItems: period.billingLineItems.map((li) => ({
          kind: toLineItemKind(li.kind),
          label: li.label,
          amountCents: li.amountCents,
          quantity: li.quantity,
          unit: toLineItemUnit(li.unit),
          rate: li.rate,
        })),
      };
    }),
  }));
}

/**
 * Resolve the dashboard farm and project its meters. Null only on a truly empty install.
 * With `demoOnly` (the public Tour, Story 5.3) it resolves the demo farm DIRECTLY via
 * `demoFarm`, never the real connected farm, so a real grower's data can never leak to an
 * unauthenticated visitor. Otherwise it owner-scopes on `userId` (the signed-in operator,
 * from auth()): the grower sees their own farm, or the badged demo when they own none.
 */
export async function loadDashboard(
  prisma: PrismaClient,
  opts: { demoOnly?: boolean; userId?: string | null; activeFarmId?: string | null } = {},
): Promise<DashboardData | null> {
  const resolved = opts.demoOnly
    ? await demoFarm(prisma)
    : await dashboardFarm(prisma, opts.userId, opts.activeFarmId);
  if (!resolved) return null;
  const meters = await loadMetersForFarm(prisma, resolved.farm.id);
  return {
    farm: { id: resolved.farm.id, name: resolved.farm.name },
    dataKind: resolved.dataKind,
    meters,
  };
}
