// Onboarding DB edge: build a farm from connected meters, classify each meter, and
// persist the farmer's confirmations. The DB side of onboarding (the parse, the
// classify, and the math it stands on are pure). Takes a PrismaClient so it runs
// against the app singleton or a throwaway test db, exactly like importGreenButton
// in src/lib/greenbutton/import.ts. The route-local server actions are thin wrappers
// over these functions; everything here is unit-testable without Next.

import type { PrismaClient } from "@prisma/client";
import {
  type BayouBillCounts,
  bayouConfigured,
  bayouUtility,
  createBayouCustomer,
  getBayouBillCounts,
  getBayouCustomer,
  getBayouCustomerRaw,
} from "@/lib/bayou/client";
import {
  createUtilityApiForm,
  getUtilityApiAuthorizations,
  getUtilityApiMetersRaw,
  readyCountsFromRaw,
  utilityApiConfigured,
} from "@/lib/utilityapi/client";
import { classifyMeter, meterSignature } from "@/lib/energy";
import type { IntervalReading } from "@/lib/energy/types";
import { importBayou, importGreenButton, importUtilityApi } from "@/lib/greenbutton/import";
import { countUtilityApiMeters, normalizeBayou, normalizeUtilityApi } from "@/lib/normalize";
import type { NormalizedMeter } from "@/lib/normalize";
import type { PowerSource, PumpKind } from "@/lib/recommendations/types";
import {
  canonicalEntityKey,
  displayOwner,
  parseInventory,
  type InventoryRow,
} from "@/lib/spreadsheet";
import { geocodeAddress } from "./geocode";
import {
  fetchBayou,
  fetchGreenButton,
  fetchUtilityApi,
  loadSampleBayou,
  loadSampleUtilityApi,
  type SampleFeed,
} from "./source";

const PGE_SMD = "pge_smd";

// --- creating a farm from a connection -----------------------------------------

export type NewFarmInput = {
  /** Farm name. Defaults to "My Farm"; the farmer renames it in the confirm step. */
  name?: string;
  /** Optional owner; we record the operation even before people are added. */
  ownerName?: string;
  /** Provider-side authorization reference for the Connection. */
  externalRef?: string | null;
};

/**
 * Create a fresh Farm with a pending PG&E (Share My Data) Connection and, if given,
 * an owner Person. The Connection flips to "active" when the farmer finishes the
 * confirm step (see finalize logic in saveConfirmation).
 */
export async function createFarmFromConnection(
  prisma: PrismaClient,
  input: NewFarmInput = {},
): Promise<{ farmId: string }> {
  const farm = await prisma.farm.create({
    data: {
      name: input.name?.trim() || "My Farm",
      people: input.ownerName?.trim()
        ? { create: [{ name: input.ownerName.trim(), role: "owner", language: "en" }] }
        : undefined,
      connections: {
        create: [
          {
            type: PGE_SMD,
            status: "pending",
            // Provenance (C4) is unknown at identify - it is set when the first real source
            // is added (addPgeFeed -> smd, addGreenButtonFiles -> green_button, a bill ->
            // bill_upload), so a bill-only farm is never mislabeled as SMD-authorized.
            source: null,
            externalRef: input.externalRef ?? null,
          },
        ],
      },
    },
  });
  return { farmId: farm.id };
}

// --- classification (writes the verdict + a rough pin onto each metered pump) ----

function toReading(row: {
  start: Date;
  durationSec: number;
  kWh: number;
}): IntervalReading {
  return { start: row.start.toISOString(), durationSec: row.durationSec, kWh: row.kWh };
}

/**
 * Classify every metered pump on a farm from its usage signature and pre-place its
 * map pin from the ServiceLocation address. Run right after an import. Idempotent:
 * re-running recomputes from the same data. Skips pumps the farmer has already
 * located (a non-null pin) so it never stomps a dragged pin on re-import.
 */
export async function classifyFarmPumps(
  prisma: PrismaClient,
  farmId: string,
): Promise<void> {
  const pumps = await prisma.pump.findMany({
    where: { farmId },
    include: {
      intervals: { orderBy: { start: "asc" } },
      billingPeriods: true,
    },
  });

  for (const pump of pumps) {
    const sig = meterSignature(pump.intervals.map(toReading), {
      tariff: pump.rateSchedule,
      cyclePeakKw: pump.billingPeriods
        .map((b) => b.peakKw)
        .filter((p): p is number => p !== null),
    });
    const verdict = classifyMeter(sig);
    const pin = pump.latitude === null ? geocodeAddress(pump.location) : null;

    await prisma.pump.update({
      where: { id: pump.id },
      data: {
        kind: verdict.kind,
        ...(pin ? { latitude: pin.lat, longitude: pin.lng } : {}),
      },
    });
  }
}

// --- the high-level connect flows the actions call -----------------------------

export type ConnectResult = {
  farmId: string;
  pumps: number;
  pumpsClassified: number;
  nonPumpsClassified: number;
};

/**
 * The "Connect PG&E" path: create a farm, pull the (sample) Green Button feed,
 * import it, then classify. Returns the new farmId for the confirm-step redirect.
 */
export async function connectSampleFeed(
  prisma: PrismaClient,
  opts: { name?: string; sampleFeed?: SampleFeed } = {},
): Promise<ConnectResult> {
  const { farmId } = await createFarmFromConnection(prisma, {
    name: opts.name,
    externalRef: "PGE-SMD-SAMPLE",
  });
  const xml = await fetchGreenButton({ sampleFeed: opts.sampleFeed });
  await importGreenButton(prisma, { xml, farmId });
  await classifyFarmPumps(prisma, farmId);
  return summarize(prisma, farmId);
}

/**
 * The grower-controlled bulk path: a real PG&E Green Button / "Download My Data" (ESPI)
 * export the grower pulls from pge.com, uploaded here. Unlike the Bayou connector, an
 * ESPI feed carries every service point the grower exported in one file (and the grower
 * can drop in several, one per account), so this is how a big multi-account operation
 * gets all of its meters in without depending on Bayou enumerating them. We create the
 * farm, import each file (upsert by service id, so files accumulate), then classify.
 */
export async function connectGreenButtonUpload(
  prisma: PrismaClient,
  { xmls, name }: { xmls: string[]; name?: string },
): Promise<ConnectResult> {
  const { farmId } = await createFarmFromConnection(prisma, {
    name,
    externalRef: "PGE-GREENBUTTON",
  });
  for (const xml of xmls) {
    await importGreenButton(prisma, { xml, farmId });
  }
  await classifyFarmPumps(prisma, farmId);
  return summarize(prisma, farmId);
}

// --- the master meter list (the grower's own spreadsheet) -----------------------

export type InventoryImportResult = {
  pumpsCreated: number;
  pumpsUpdated: number;
  entities: number;
  accounts: number;
  blocks: number;
  ranches: number;
  arrays: number;
  /** NEMA codes meters referenced but no generating row defined: surfaced, not dropped. */
  unlinkedNemaCodes: string[];
};

/** Pump name when the sheet gives none: prefer the service id, then the meter serial. */
function inventoryName(row: InventoryRow): string {
  if (row.name) return row.name;
  if (row.serviceId) return `Service ${row.serviceId}`;
  if (row.meterSerial) return `Meter ${row.meterSerial}`;
  return "Meter";
}

/**
 * Land a parsed master meter list onto a farm. Unlike a usage feed, the spreadsheet
 * carries the org chart: it dedupes the legal Entities (billing-name variants collapse
 * to one true owner), creates the PG&E Accounts (linked to their entity), the Ranch
 * rollup and the served Blocks, the solar Arrays with their NEMA benefiting-meter graph,
 * and every meter as a Pump with its full inventory (rate as-read, serial code, Pump ID,
 * legacy flag, status, crop, location, GPM, solar/NEM). Identity is the PG&E service id
 * (SA ID), so this reconciles with whatever the ESPI/Bayou feeds already imported: a
 * meter that exists gets its inventory fields filled in, a new one is created. Idempotent.
 */
export async function importInventory(
  prisma: PrismaClient,
  { rows, farmId }: { rows: InventoryRow[]; farmId: string },
): Promise<InventoryImportResult> {
  const result: InventoryImportResult = {
    pumpsCreated: 0,
    pumpsUpdated: 0,
    entities: 0,
    accounts: 0,
    blocks: 0,
    ranches: 0,
    arrays: 0,
    unlinkedNemaCodes: [],
  };

  // A whole-farm import is many sequential writes; raise the interactive-transaction
  // ceiling well above Prisma's 5s default so a large sheet (or Postgres latency once
  // we move off SQLite) cannot roll the entire import back with P2028.
  await prisma.$transaction(async (tx) => {
    const entityIdByKey = new Map<string, string>();
    const accountIdByNumber = new Map<string, string>();
    const blockIdByName = new Map<string, string>();
    const ranchIdByName = new Map<string, string>();
    const cropIdByName = new Map<string, string>();

    // Dedupe Entities on a deterministic canonical key so billing-name variants of one
    // owner collapse to a single Entity (7 spellings -> 6 entities), without guessing.
    // First-seen variant becomes `name`/`billingName`; `actualOwner` is the canonical owner.
    const resolveEntity = async (rawName: string | null): Promise<string | null> => {
      if (!rawName) return null;
      const key = canonicalEntityKey(rawName);
      const cached = entityIdByKey.get(key);
      if (cached) return cached;
      const owner = displayOwner(rawName);
      const existing = await tx.entity.findFirst({ where: { farmId, actualOwner: owner } });
      const row =
        existing ??
        (await tx.entity.create({
          data: { farmId, name: rawName, billingName: rawName, actualOwner: owner },
        }));
      entityIdByKey.set(key, row.id);
      return row.id;
    };

    const resolveAccount = async (
      number: string | null,
      entityId: string | null,
    ): Promise<string | null> => {
      if (!number) return null;
      const account = await tx.account.upsert({
        where: { farmId_number: { farmId, number } },
        update: entityId ? { entityId } : {},
        create: { farmId, number, entityId },
      });
      accountIdByNumber.set(number, account.id);
      return account.id;
    };

    const resolveBlock = async (name: string | null): Promise<string | null> => {
      if (!name) return null;
      const cached = blockIdByName.get(name);
      if (cached) return cached;
      const existing = await tx.block.findFirst({ where: { farmId, name } });
      const row = existing ?? (await tx.block.create({ data: { farmId, name } }));
      blockIdByName.set(name, row.id);
      return row.id;
    };

    // The Ranch rollup the dashboard reads (Entity -> Account -> Ranch -> Meter). The
    // sheet's grouping name feeds both Ranch (new) and the existing served-Block m-n;
    // Block is kept intact (seed + confirm step depend on it) until a later cleanup.
    const resolveRanch = async (name: string | null): Promise<string | null> => {
      if (!name) return null;
      const cached = ranchIdByName.get(name);
      if (cached) return cached;
      const existing = await tx.ranch.findFirst({ where: { farmId, name } });
      const row = existing ?? (await tx.ranch.create({ data: { farmId, name } }));
      ranchIdByName.set(name, row.id);
      return row.id;
    };

    // Crop.name is globally unique and shared across farms, so canonicalize the name the
    // same way the confirm step does (normalizeCropName) before upserting - otherwise
    // "almonds" / "Almonds " fork the shared catalog. Cache by the normalized name.
    const resolveCrop = async (rawName: string | null): Promise<string | null> => {
      const name = normalizeCropName(rawName);
      if (!name) return null;
      const cached = cropIdByName.get(name);
      if (cached) return cached;
      const crop = await tx.crop.upsert({ where: { name }, update: {}, create: { name } });
      cropIdByName.set(name, crop.id);
      return crop.id;
    };

    // Collected during the meter loop, resolved into the SolarArray/NEMA graph after,
    // once every meter has an id to connect. arrayMeta carries the generating meter's
    // nameplate/NEM/true-up per NEMA code; pumpArrayLinks records each meter's code(s).
    const arrayMeta = new Map<
      string,
      { nameplateKw: number; nemType: string | null; trueUpMonth: number | null; saId: string | null }
    >();
    const pumpArrayLinks: Array<{ pumpId: string; codes: string[] }> = [];

    for (const row of rows) {
      const entityId = await resolveEntity(row.entityName);
      const accountId = await resolveAccount(row.accountNumber, entityId);
      const blockId = await resolveBlock(row.blockName);
      const ranchId = await resolveRanch(row.blockName);
      const cropId = await resolveCrop(row.cropName);

      // Inventory fields shared by create and update. `?? undefined` leaves a column
      // untouched on update when the sheet does not carry that value. serialCode is the
      // canonical cycle code; billingSerial is written in sync so the untouched readers
      // (greenbutton/schedule.ts, the dormant onboarding/Bayou paths, the seed) keep
      // working - the full billingSerial cutover is deferred (see deferred-work.md).
      const fields = {
        meterSerial: row.meterSerial ?? undefined,
        rateSchedule: row.rateSchedule ?? undefined,
        serialCode: row.serialCode ?? undefined,
        billingSerial: row.serialCode ?? undefined,
        rotatingOutageBlock: row.rotatingOutageBlock ?? undefined,
        location: row.location ?? undefined,
        latitude: row.latitude ?? undefined,
        longitude: row.longitude ?? undefined,
        gpm: row.gpm ?? undefined,
        horsepower: row.horsepower ?? undefined,
        nemType: row.nemType ?? undefined,
        trueUpMonth: row.trueUpMonth ?? undefined,
        solarKw: row.solarKw ?? undefined,
        growerPumpId: row.growerPumpId ?? undefined,
        isLegacy: row.isLegacy,
        isSolar: row.isSolar,
        status: row.status ?? undefined,
        cropId: cropId ?? undefined,
        ranchId: ranchId ?? undefined,
        kind: row.kind,
        accountId: accountId ?? undefined,
        ...(blockId ? { blocks: { connect: { id: blockId } } } : {}),
      };

      // Match an existing meter by SA ID (preferred), then by physical serial, so a
      // re-import or a sheet imported after an ESPI/Bayou pull merges instead of dupes.
      const existing = row.serviceId
        ? await tx.pump.findUnique({
            where: { farmId_serviceId: { farmId, serviceId: row.serviceId } },
          })
        : row.meterSerial
          ? await tx.pump.findFirst({ where: { farmId, meterSerial: row.meterSerial } })
          : null;

      let pumpId: string;
      if (existing) {
        await tx.pump.update({
          where: { id: existing.id },
          data: { ...fields, name: row.name ?? undefined },
        });
        pumpId = existing.id;
        result.pumpsUpdated += 1;
      } else {
        const created = await tx.pump.create({
          data: {
            farmId,
            serviceId: row.serviceId,
            name: inventoryName(row),
            fuel: "electric",
            ...fields,
          },
        });
        pumpId = created.id;
        result.pumpsCreated += 1;
      }

      // A meter can draw from more than one array (";"-separated NEMA codes). The row
      // that also carries a nameplate is the array's generating meter (defines the array).
      const codes = (row.nemaCode ?? "").split(";").map((c) => c.trim()).filter(Boolean);
      if (codes.length > 0) {
        pumpArrayLinks.push({ pumpId, codes });
        // A row carrying a nameplate is a generating meter; record it for EVERY code it
        // lists (a generator can feed more than one aggregation group) so a multi-code
        // generator's nameplate is never lost.
        if (row.solarKw != null) {
          for (const code of codes) {
            arrayMeta.set(code, {
              nameplateKw: row.solarKw,
              nemType: row.nemType,
              trueUpMonth: row.trueUpMonth,
              saId: row.serviceId,
            });
          }
        }
      }
    }

    // Build the SolarArray/NEMA graph: one array per code that has a known nameplate,
    // then connect every benefiting meter. Identity is (farmId, name=code) so re-import
    // reuses the array instead of duplicating it.
    const arrayIdByCode = new Map<string, string>();
    for (const [code, meta] of arrayMeta) {
      const existing = await tx.solarArray.findFirst({ where: { farmId, name: code } });
      const array = existing
        ? await tx.solarArray.update({
            where: { id: existing.id },
            data: {
              nameplateKw: meta.nameplateKw,
              nemType: meta.nemType ?? undefined,
              trueUpMonth: meta.trueUpMonth ?? undefined,
              saId: meta.saId ?? undefined,
            },
          })
        : await tx.solarArray.create({
            data: {
              farmId,
              name: code,
              nameplateKw: meta.nameplateKw,
              nemType: meta.nemType,
              trueUpMonth: meta.trueUpMonth,
              saId: meta.saId,
            },
          });
      arrayIdByCode.set(code, array.id);
    }
    // Group benefiting meters per array, then connect (idempotent: the m-n join pair is
    // unique, so re-connecting an already-linked meter is a no-op).
    const benefitByArrayId = new Map<string, Set<string>>();
    for (const link of pumpArrayLinks) {
      for (const code of link.codes) {
        const arrayId = arrayIdByCode.get(code);
        if (!arrayId) continue;
        const set = benefitByArrayId.get(arrayId) ?? new Set<string>();
        set.add(link.pumpId);
        benefitByArrayId.set(arrayId, set);
      }
    }
    for (const [arrayId, pumpIds] of benefitByArrayId) {
      await tx.solarArray.update({
        where: { id: arrayId },
        data: { benefitingMeters: { connect: [...pumpIds].map((id) => ({ id })) } },
      });
    }

    // Surface NEMA codes that meters referenced but no generating row defined, so a
    // missing array reads as needs-review rather than a silent drop (NFR-4). The meters
    // still persist with their flat solar fields; only the array link is absent.
    const referenced = new Set<string>();
    for (const link of pumpArrayLinks) for (const code of link.codes) referenced.add(code);
    const unlinked = [...referenced].filter((code) => !arrayIdByCode.has(code)).sort();
    if (unlinked.length > 0) {
      console.warn(
        `importInventory: ${unlinked.length} NEMA code(s) had no generating meter, no SolarArray built: ${unlinked.join(", ")}`,
      );
    }

    result.entities = entityIdByKey.size;
    result.accounts = accountIdByNumber.size;
    result.blocks = blockIdByName.size;
    result.ranches = ranchIdByName.size;
    result.arrays = arrayIdByCode.size;
    result.unlinkedNemaCodes = unlinked;
  }, { timeout: 120_000, maxWait: 15_000 });

  return result;
}

/**
 * The onboarding path for a grower's master meter list (CSV). Parses the sheet, creates
 * the farm, and lands the full inventory (entities, accounts, blocks, every meter). No
 * usage data, so no classification: the meter kind comes from the sheet (default pump).
 */
export async function connectSpreadsheet(
  prisma: PrismaClient,
  { csv, name }: { csv: string; name?: string },
): Promise<ConnectResult> {
  const { rows } = parseInventory(csv);
  const { farmId } = await createFarmFromConnection(prisma, {
    name,
    externalRef: "PGE-SPREADSHEET",
  });
  await importInventory(prisma, { rows, farmId });
  return summarize(prisma, farmId);
}

// --- the real grower flow: connect a live PG&E account through Bayou -------------
// Bayou is asynchronous: create a customer, the grower enters their PG&E login in the
// embedded onboarding form (Bayou.loadOnboardingForm), then bills/intervals arrive
// minutes-to-hours later. So the connect splits in two: startBayouConnection sets it
// up and hands back the onboarding token; the pending screen polls bayouReadiness and
// calls finishBayouConnection once the data is ready.

export type StartBayouResult = {
  farmId: string;
  /** Bayou customer id (also stored as Connection.externalRef). */
  customerId: string;
  /** Token for the embedded onboarding component on the client. */
  onboardingToken: string;
  /** Hosted onboarding page, the fallback when the embed is not configured. */
  onboardingLink: string;
  /** The reused customer already has a valid PG&E session, so the client should skip
   * the login form and go straight to the waiting screen (no second MFA). */
  alreadyAuthenticated: boolean;
};

/**
 * The most recent PG&E connection whose Bayou customer still has a valid session, if
 * any. Reusing it is what stops a grower from being pushed through PG&E's MFA again for
 * an account they already connected: a new Bayou customer has no stored session, so the
 * utility forces a fresh login, while an authenticated one is ready to pull as-is.
 */
async function authenticatedBayouConnection(
  prisma: PrismaClient,
): Promise<StartBayouResult | null> {
  if (!bayouConfigured()) return null;
  const conns = await prisma.connection.findMany({
    where: { type: PGE_SMD, status: { in: ["active", "pending"] } },
    orderBy: { createdAt: "desc" },
    select: { farmId: true, externalRef: true },
  });
  for (const conn of conns) {
    const id = liveCustomerId(conn.externalRef);
    if (!id) continue;
    try {
      const customer = await getBayouCustomer(id);
      if (customer.is_currently_authenticated) {
        return {
          farmId: conn.farmId,
          customerId: String(customer.id),
          onboardingToken: customer.onboarding_token,
          onboardingLink: customer.onboarding_link,
          alreadyAuthenticated: true,
        };
      }
    } catch {
      // Unreadable customer (deleted, transient error): skip and try the next.
    }
  }
  return null;
}

/**
 * Start a live PG&E connection. By default, if a previously connected account still has
 * a valid Bayou session, reuse it (so the grower is not asked to sign in and pass MFA
 * again). Pass `forceNew` to skip that reuse and always create a fresh Bayou customer:
 * this is what lets a grower connect a *different* PG&E account instead of being
 * auto-signed back into the last one (essential for a multi-account operation). Either
 * way it creates a farm with a pending PG&E connection whose externalRef is the customer
 * id, and returns what the client needs to render the embedded onboarding form. Requires
 * the Bayou API to be configured (BAYOU_DOMAIN + BAYOU_API_KEY); the grower never sees
 * their credentials leave Bayou's form.
 */
export async function startBayouConnection(
  prisma: PrismaClient,
  opts: { name?: string; email?: string | null; forceNew?: boolean } = {},
): Promise<StartBayouResult> {
  if (!bayouConfigured()) {
    throw new Error(
      "Bayou is not configured. Set BAYOU_DOMAIN and BAYOU_API_KEY to connect a live account.",
    );
  }
  // Reuse an existing authenticated session only when not explicitly connecting a new
  // account. The connect button passes forceNew so signing in with a different PG&E
  // login always shows the sign-in form instead of silently reusing the last one.
  const reusable = opts.forceNew ? null : await authenticatedBayouConnection(prisma);
  if (reusable) return reusable;

  const customer = await createBayouCustomer({ email: opts.email });
  const { farmId } = await createFarmFromConnection(prisma, {
    name: opts.name,
    externalRef: String(customer.id),
  });
  return {
    farmId,
    customerId: String(customer.id),
    onboardingToken: customer.onboarding_token,
    onboardingLink: customer.onboarding_link,
    alreadyAuthenticated: false,
  };
}

export type BayouReadiness = {
  /** No live customer (sample/sentinel ref, or API not configured): ready off fixtures. */
  sample: boolean;
  /** Login accepted by the utility. */
  hasCredentials: boolean;
  /** Bill history pulled and ready to GET. */
  billsReady: boolean;
  /** Interval (usage) history pulled and ready to GET. */
  intervalsReady: boolean;
  /** Both data sets are ready: safe to import. */
  ready: boolean;
  /** Live bill parse counts for the progress UI; null for sample or until bills land. */
  bills: BayouBillCounts | null;
};

/** Provider-neutral readiness (UtilityAPI and Bayou report the same shape). */
export type Readiness = BayouReadiness;

/** A numeric externalRef is a live Bayou customer id; sentinels like "BAYOU-271489"
 * or "PGE-SMD-SAMPLE" mean the sample feed. */
function liveCustomerId(externalRef: string | null): string | null {
  return externalRef && /^\d+$/.test(externalRef) ? externalRef : null;
}

/** Sample/sentinel externalRefs (not a live provider id): these mean the fixtures. */
const SAMPLE_REFS = new Set(["PGE-SMD-SAMPLE", "PGE-GREENBUTTON", "PGE-SPREADSHEET"]);

/** A live UtilityAPI authorization-form uid, or null for the sample sentinels. The form
 * uid is stored as Connection.externalRef by startUtilityApiConnection. */
function liveFormUid(externalRef: string | null): string | null {
  if (!externalRef || SAMPLE_REFS.has(externalRef)) return null;
  return externalRef;
}

async function pgeConnection(prisma: PrismaClient, farmId: string) {
  return prisma.connection.findFirst({
    where: { farmId, type: PGE_SMD },
    orderBy: { createdAt: "desc" },
  });
}

/** Where a farm's Bayou pull stands. The pending screen polls this. */
export async function bayouReadiness(
  prisma: PrismaClient,
  farmId: string,
): Promise<BayouReadiness> {
  const conn = await pgeConnection(prisma, farmId);
  const id = liveCustomerId(conn?.externalRef ?? null);
  if (!id || !bayouConfigured()) {
    // Sample/demo: the fixtures are always there, so it is immediately importable.
    return {
      sample: true,
      hasCredentials: true,
      billsReady: true,
      intervalsReady: true,
      ready: true,
      bills: null,
    };
  }
  const customer = await getBayouCustomer(id);
  // Only count bills once they have landed; before that the count is in flux and the
  // extra fetch is wasted. Best-effort: a count failure must not break the poll.
  let bills: BayouBillCounts | null = null;
  if (customer.bills_are_ready) {
    try {
      bills = await getBayouBillCounts(id);
    } catch {
      bills = null;
    }
  }
  return {
    sample: false,
    hasCredentials: customer.has_filled_credentials,
    billsReady: customer.bills_are_ready,
    intervalsReady: customer.intervals_are_ready,
    ready: customer.bills_are_ready && customer.intervals_are_ready,
    bills,
  };
}

// --- the onboarding reveal: live counts off the normalized model -----------------
// The reveal screen animates the farm assembling itself (accounts, meters, bills) as
// the data lands. The numbers come from the same normalizer the importer uses, so the
// reveal can never show a count the import then contradicts. customer.account_numbers[]
// is available the moment Bayou accepts the login, before bills/intervals finish, so
// the account + meter counts settle first and only the bills line trails.

export type RevealCounts = {
  /** Where these numbers came from, so the UI can badge a synthetic figure. */
  dataKind: "sample" | "sandbox" | "real";
  /** Utility accepted the login: the "Connected to PG&E" line can show. */
  hasCredentials: boolean;
  /** Distinct PG&E account numbers in the normalized customer record. */
  accounts: number;
  /** Electric meters (the ones the engine optimizes). */
  electricMeters: number;
  /** Gas meters (carried, not billed). */
  gasMeters: number;
  billsReady: boolean;
  intervalsReady: boolean;
  /** Live bill parse counts for the determinate progress bar; null until bills land. */
  bills: BayouBillCounts | null;
  /** Both data sets ready: safe to import (the machine then calls finish). */
  ready: boolean;
};

/** Count distinct accounts and meters-by-fuel off a normalized meter list. */
function countMeters(meters: NormalizedMeter[]): {
  accounts: number;
  electricMeters: number;
  gasMeters: number;
} {
  const accounts = new Set(
    meters.map((m) => m.accountNumber).filter((a): a is string => a !== null),
  );
  return {
    accounts: accounts.size,
    electricMeters: meters.filter((m) => m.fuel === "electric").length,
    gasMeters: meters.filter((m) => m.fuel === "gas").length,
  };
}

/**
 * Live counts for the onboarding reveal. Sample/unconfigured farms count off the
 * committed fixture and report ready immediately. A live customer reports the readiness
 * booleans from Bayou, and once the login is accepted, counts accounts + meters from the
 * raw customer record (which arrives before bills/intervals), then folds in bill parse
 * counts once bills are ready. dataKind distinguishes the Speculoos sandbox from real
 * PG&E so the UI can badge synthetic numbers.
 */
export async function bayouReveal(
  prisma: PrismaClient,
  farmId: string,
): Promise<RevealCounts> {
  const conn = await pgeConnection(prisma, farmId);
  const id = liveCustomerId(conn?.externalRef ?? null);
  if (!id || !bayouConfigured()) {
    const { accounts, electricMeters, gasMeters } = countMeters(
      normalizeBayou(loadSampleBayou()),
    );
    return {
      dataKind: "sample",
      hasCredentials: true,
      accounts,
      electricMeters,
      gasMeters,
      billsReady: true,
      intervalsReady: true,
      bills: null,
      ready: true,
    };
  }

  const customer = await getBayouCustomer(id);
  let accounts = 0;
  let electricMeters = 0;
  let gasMeters = 0;
  if (customer.has_filled_credentials) {
    // The typed customer exposes only booleans; the raw body carries the meter list.
    // Best-effort: a transient read failure leaves zeros, and the next poll retries.
    try {
      const raw = await getBayouCustomerRaw(id);
      ({ accounts, electricMeters, gasMeters } = countMeters(
        normalizeBayou({ customer: raw, bills: undefined, intervals: undefined }),
      ));
    } catch {
      // leave zeros; the next poll picks the counts back up
    }
  }

  let bills: BayouBillCounts | null = null;
  if (customer.bills_are_ready) {
    try {
      bills = await getBayouBillCounts(id);
    } catch {
      bills = null;
    }
  }

  return {
    dataKind: bayouUtility() === "speculoos_power" ? "sandbox" : "real",
    hasCredentials: customer.has_filled_credentials,
    accounts,
    electricMeters,
    gasMeters,
    billsReady: customer.bills_are_ready,
    intervalsReady: customer.intervals_are_ready,
    bills,
    ready: customer.bills_are_ready && customer.intervals_are_ready,
  };
}

/**
 * Finish a Bayou connection: pull it live (or the sample), import (electric -> pumps,
 * gas carried but not persisted), classify, and flip the connection active. Returns the
 * ConnectResult, or null when the data is not ready yet (the poller keeps waiting).
 *
 * With `force`, it imports whatever Bayou has so far instead of waiting for the full
 * pull, the "continue with what's ready" path: a Bayou-side interval lag or bill parse
 * issue no longer blocks the grower from seeing their meters and bills. Idempotent: an
 * already-active connection just returns its summary, and the importer upserts, so a
 * repeated call cannot duplicate data.
 */
export async function finishBayouConnection(
  prisma: PrismaClient,
  farmId: string,
  opts: { force?: boolean } = {},
): Promise<ConnectResult | null> {
  const conn = await pgeConnection(prisma, farmId);
  if (!conn) throw new Error(`no PG&E connection for farm ${farmId}`);
  if (conn.status === "active") return summarize(prisma, farmId);

  const id = liveCustomerId(conn.externalRef);
  const live = Boolean(id && bayouConfigured());
  if (live && id && !opts.force) {
    // Lightweight gate (flags only, no bill-count fetch).
    const customer = await getBayouCustomer(id);
    if (!(customer.bills_are_ready && customer.intervals_are_ready)) return null;
  }

  const pull = await fetchBayou(live ? { customerId: id } : {});
  await importBayou(prisma, { pull, farmId });
  await classifyFarmPumps(prisma, farmId);
  await prisma.connection.updateMany({
    where: { farmId, type: PGE_SMD },
    data: { status: "active", authorizedAt: new Date() },
  });
  return summarize(prisma, farmId);
}

/**
 * The most recent in-progress live Bayou connection, so a grower who navigated away
 * from the pending screen can resume instead of starting over. "In progress" means a
 * pending PG&E connection to a live Bayou customer (numeric externalRef) who has
 * already signed in (or whose data is partly ready). Returns null when there is none,
 * so onboarding only offers "resume" when there is something real to resume. If Bayou
 * is unreachable, it still allows resuming (better a re-poll than a dead end).
 */
export async function resumableBayouFarm(
  prisma: PrismaClient,
): Promise<{ farmId: string } | null> {
  const conn = await prisma.connection.findFirst({
    where: { type: PGE_SMD, status: "pending" },
    orderBy: { createdAt: "desc" },
    select: { farmId: true, externalRef: true },
  });
  const id = conn ? liveCustomerId(conn.externalRef) : null;
  if (!conn || !id || !bayouConfigured()) return null;
  try {
    const customer = await getBayouCustomer(id);
    const started =
      customer.has_filled_credentials ||
      customer.bills_are_ready ||
      customer.intervals_are_ready;
    return started ? { farmId: conn.farmId } : null;
  } catch {
    return { farmId: conn.farmId };
  }
}

// --- the live grower flow through UtilityAPI ------------------------------------
// UtilityAPI replaced Bayou as the live connect: one authorization form returns many
// authorizations (one per PG&E account), so a multi-account operation connects in one
// pass. The lifecycle mirrors Bayou's (start -> poll readiness -> reveal counts ->
// finish import) and reuses every non-provider helper (createFarmFromConnection,
// classifyFarmPumps, summarize, countMeters, the RevealCounts/Readiness shapes).

export type StartUtilityApiResult = {
  farmId: string;
  /** Authorization-form uid (also stored as Connection.externalRef). */
  formUid: string;
  /** Hosted authorization page the grower opens to pick accounts (no JS embed). */
  formUrl: string;
};

/**
 * Start a live PG&E connection through UtilityAPI: create an authorization form, a farm
 * with a pending PG&E connection whose externalRef is the form uid, and return the
 * hosted form url the client opens. The grower signs in to PG&E and selects accounts on
 * UtilityAPI's page; credentials never touch Terra. Requires UTILITYAPI_TOKEN.
 */
export async function startUtilityApiConnection(
  prisma: PrismaClient,
  opts: { name?: string; email?: string | null } = {},
): Promise<StartUtilityApiResult> {
  if (!utilityApiConfigured()) {
    throw new Error(
      "UtilityAPI is not configured. Set UTILITYAPI_TOKEN to connect a live account.",
    );
  }
  const form = await createUtilityApiForm({ email: opts.email });
  const { farmId } = await createFarmFromConnection(prisma, {
    name: opts.name,
    externalRef: form.uid,
  });
  return { farmId, formUid: form.uid, formUrl: form.url };
}

/** Where a farm's UtilityAPI pull stands. Returns the same shape as bayouReadiness, so
 * the poller is provider-agnostic. */
export async function utilityApiReadiness(
  prisma: PrismaClient,
  farmId: string,
): Promise<Readiness> {
  const conn = await pgeConnection(prisma, farmId);
  const formUid = liveFormUid(conn?.externalRef ?? null);
  if (!formUid || !utilityApiConfigured()) {
    return {
      sample: true,
      hasCredentials: true,
      billsReady: true,
      intervalsReady: true,
      ready: true,
      bills: null,
    };
  }
  const auths = await getUtilityApiAuthorizations(formUid);
  if (auths.length === 0) {
    return {
      sample: false,
      hasCredentials: false,
      billsReady: false,
      intervalsReady: false,
      ready: false,
      bills: null,
    };
  }
  const raw = await getUtilityApiMetersRaw(auths.map((a) => a.uid));
  const { total, ready } = readyCountsFromRaw(raw);
  const dataReady = total > 0 && ready === total;
  return {
    sample: false,
    hasCredentials: true,
    billsReady: dataReady,
    intervalsReady: dataReady,
    ready: dataReady,
    bills: total > 0 ? { total, usable: ready, unparsed: total - ready } : null,
  };
}

/**
 * Live counts for the onboarding reveal off UtilityAPI. Sample/unconfigured farms count
 * off the committed multi-account fixture and report ready immediately. A live form
 * reports its authorizations: once any land, accounts + meters come from the native
 * /meters body (which arrives before the Green Button exports), then the meter-collection
 * progress folds in as collections finish. Same shape as bayouReveal.
 */
export async function utilityApiReveal(
  prisma: PrismaClient,
  farmId: string,
): Promise<RevealCounts> {
  const conn = await pgeConnection(prisma, farmId);
  const formUid = liveFormUid(conn?.externalRef ?? null);
  if (!formUid || !utilityApiConfigured()) {
    const { accounts, electricMeters, gasMeters } = countUtilityApiMeters(
      loadSampleUtilityApi().meters,
    );
    return {
      dataKind: "sample",
      hasCredentials: true,
      accounts,
      electricMeters,
      gasMeters,
      billsReady: true,
      intervalsReady: true,
      bills: null,
      ready: true,
    };
  }

  const auths = await getUtilityApiAuthorizations(formUid);
  if (auths.length === 0) {
    return {
      dataKind: "real",
      hasCredentials: false,
      accounts: 0,
      electricMeters: 0,
      gasMeters: 0,
      billsReady: false,
      intervalsReady: false,
      bills: null,
      ready: false,
    };
  }
  const raw = await getUtilityApiMetersRaw(auths.map((a) => a.uid));
  const { accounts, electricMeters, gasMeters } = countUtilityApiMeters(raw);
  const { total, ready } = readyCountsFromRaw(raw);
  const dataReady = total > 0 && ready === total;
  return {
    dataKind: "real",
    hasCredentials: true,
    accounts,
    electricMeters,
    gasMeters,
    billsReady: dataReady,
    intervalsReady: dataReady,
    bills: total > 0 ? { total, usable: ready, unparsed: total - ready } : null,
    ready: dataReady,
  };
}

/**
 * Finish a UtilityAPI connection: pull it live (or the sample), import (electric ->
 * pumps across all shared accounts, gas carried but not persisted), classify, and flip
 * the connection active with provenance "smd" (a real signed authorization). Returns the
 * ConnectResult, or null when the data is not ready yet. `force` imports whatever has
 * collected so far. Idempotent: an already-active connection just returns its summary.
 */
export async function finishUtilityApiConnection(
  prisma: PrismaClient,
  farmId: string,
  opts: { force?: boolean } = {},
): Promise<ConnectResult | null> {
  const conn = await pgeConnection(prisma, farmId);
  if (!conn) throw new Error(`no PG&E connection for farm ${farmId}`);
  if (conn.status === "active") return summarize(prisma, farmId);

  const formUid = liveFormUid(conn.externalRef);
  const live = Boolean(formUid && utilityApiConfigured());
  let authUids: string[] = [];
  if (live && formUid) {
    const auths = await getUtilityApiAuthorizations(formUid);
    authUids = auths.map((a) => a.uid);
    if (!opts.force) {
      const raw = await getUtilityApiMetersRaw(authUids);
      const { total, ready } = readyCountsFromRaw(raw);
      if (!(total > 0 && ready === total)) return null;
    }
  }

  const pull = await fetchUtilityApi(live ? { authUids } : {});
  await importUtilityApi(prisma, { pull, farmId });
  await classifyFarmPumps(prisma, farmId);
  await prisma.connection.updateMany({
    where: { farmId, type: PGE_SMD },
    data: { status: "active", source: "smd", authorizedAt: new Date() },
  });
  return summarize(prisma, farmId);
}

/**
 * The most recent in-progress live UtilityAPI connection, so a grower who navigated away
 * from the reveal can resume. "In progress" means a pending PG&E connection to a live
 * form (non-sentinel externalRef) that has at least one authorization. Returns null when
 * there is none. If UtilityAPI is unreachable, it still allows resuming.
 */
export async function resumableUtilityApiFarm(
  prisma: PrismaClient,
): Promise<{ farmId: string } | null> {
  const conn = await prisma.connection.findFirst({
    where: { type: PGE_SMD, status: "pending" },
    orderBy: { createdAt: "desc" },
    select: { farmId: true, externalRef: true },
  });
  const formUid = conn ? liveFormUid(conn.externalRef) : null;
  if (!conn || !formUid || !utilityApiConfigured()) return null;
  try {
    const auths = await getUtilityApiAuthorizations(formUid);
    return auths.length > 0 ? { farmId: conn.farmId } : null;
  } catch {
    return { farmId: conn.farmId };
  }
}

// --- provider dispatch (UtilityAPI by default; Bayou behind PGE_PROVIDER) --------
// The active live path is chosen at runtime so Bayou can stay as a fallback for one
// release. The action layer and UI call only these provider-neutral functions; the
// Bayou implementations above are deleted once UtilityAPI is validated on a real
// multi-account authorization.

export type PgeProvider = "utilityapi" | "bayou";

/** The live-connect provider. UtilityAPI unless PGE_PROVIDER explicitly selects Bayou. */
export function pgeProvider(): PgeProvider {
  return process.env.PGE_PROVIDER === "bayou" ? "bayou" : "utilityapi";
}

/** What the connect screen needs: open redirectUrl (the hosted authorization page) and
 * begin polling, unless the session was already authorized (Bayou-only reuse). */
export type StartPgeResult = {
  farmId: string;
  redirectUrl: string;
  alreadyAuthenticated: boolean;
};

/** Start a live PG&E connection with the configured provider. */
export async function startPgeConnection(
  prisma: PrismaClient,
  opts: { name?: string; email?: string | null; forceNew?: boolean } = {},
): Promise<StartPgeResult> {
  if (pgeProvider() === "bayou") {
    const r = await startBayouConnection(prisma, opts);
    return {
      farmId: r.farmId,
      redirectUrl: r.onboardingLink,
      alreadyAuthenticated: r.alreadyAuthenticated,
    };
  }
  const r = await startUtilityApiConnection(prisma, opts);
  return { farmId: r.farmId, redirectUrl: r.formUrl, alreadyAuthenticated: false };
}

/** Poll readiness with the configured provider. */
export async function pgeReadiness(
  prisma: PrismaClient,
  farmId: string,
): Promise<Readiness> {
  return pgeProvider() === "bayou"
    ? bayouReadiness(prisma, farmId)
    : utilityApiReadiness(prisma, farmId);
}

/** Live reveal counts with the configured provider. */
export async function pgeReveal(
  prisma: PrismaClient,
  farmId: string,
): Promise<RevealCounts> {
  return pgeProvider() === "bayou"
    ? bayouReveal(prisma, farmId)
    : utilityApiReveal(prisma, farmId);
}

/** Finish the connection with the configured provider. */
export async function finishPgeConnection(
  prisma: PrismaClient,
  farmId: string,
  opts: { force?: boolean } = {},
): Promise<ConnectResult | null> {
  return pgeProvider() === "bayou"
    ? finishBayouConnection(prisma, farmId, opts)
    : finishUtilityApiConnection(prisma, farmId, opts);
}

/** The most recent resumable in-progress connection with the configured provider. */
export async function resumablePgeFarm(
  prisma: PrismaClient,
): Promise<{ farmId: string } | null> {
  return pgeProvider() === "bayou"
    ? resumableBayouFarm(prisma)
    : resumableUtilityApiFarm(prisma);
}

/**
 * Count the gas meters in a farm's pull. Gas is carried by the normalizer but not
 * persisted (the engine is electric-only), so the "set aside" note on the results
 * screen recomputes it from the source: the live pull for a real customer, the sample
 * otherwise. Returns 0 if the source is unavailable.
 */
export async function farmGasMeterCount(
  prisma: PrismaClient,
  farmId: string,
): Promise<number> {
  const conn = await pgeConnection(prisma, farmId);
  try {
    if (pgeProvider() === "bayou") {
      const id = liveCustomerId(conn?.externalRef ?? null);
      const pull =
        id && bayouConfigured() ? await fetchBayou({ customerId: id }) : loadSampleBayou();
      return normalizeBayou(pull).filter((m) => m.fuel === "gas").length;
    }
    const formUid = liveFormUid(conn?.externalRef ?? null);
    let authUids: string[] = [];
    if (formUid && utilityApiConfigured()) {
      const auths = await getUtilityApiAuthorizations(formUid);
      authUids = auths.map((a) => a.uid);
    }
    const pull =
      authUids.length > 0 && utilityApiConfigured()
        ? await fetchUtilityApi({ authUids })
        : loadSampleUtilityApi();
    return normalizeUtilityApi(pull).filter((m) => m.fuel === "gas").length;
  } catch {
    return 0;
  }
}

/**
 * Read everything the "connected" results screen shows for a farm: its PG&E accounts
 * and its electric meters with their bills. Electric-only mirrors the importer (gas
 * is never persisted as a pump).
 */
export async function farmConnectionSummary(prisma: PrismaClient, farmId: string) {
  return prisma.farm.findUnique({
    where: { id: farmId },
    include: {
      accounts: true,
      pumps: {
        where: { fuel: "electric" },
        orderBy: { serviceId: "asc" },
        include: {
          account: true,
          billingPeriods: { orderBy: { start: "asc" } },
        },
      },
    },
  });
}

export type ManualPumpInput = {
  name: string;
  serviceId?: string | null;
  meterSerial?: string | null;
  rateSchedule?: string | null;
  billingSerial?: string | null;
  location?: string | null;
  horsepower?: number | null;
};

/**
 * The manual / bill-scan path: create a farm with a single hand-entered electric
 * pump (no metered history yet). The pin is placed from the address if given.
 */
export async function connectManual(
  prisma: PrismaClient,
  input: { farmName?: string; pump: ManualPumpInput },
): Promise<ConnectResult> {
  const { name, ...rest } = input.pump;
  const { farmId } = await createFarmFromConnection(prisma, {
    name: input.farmName,
    externalRef: input.pump.serviceId ?? input.pump.meterSerial ?? null,
  });
  const pin = geocodeAddress(input.pump.location);
  await prisma.pump.create({
    data: {
      farmId,
      name: name.trim() || "Pump 1",
      serviceId: rest.serviceId?.trim() || null,
      meterSerial: rest.meterSerial?.trim() || null,
      rateSchedule: rest.rateSchedule?.trim() || null,
      billingSerial: rest.billingSerial?.trim() || null,
      location: rest.location?.trim() || null,
      horsepower: rest.horsepower ?? null,
      kind: "pump",
      powerSource: "electric",
      ...(pin ? { latitude: pin.lat, longitude: pin.lng } : {}),
    },
  });
  return summarize(prisma, farmId);
}

async function summarize(
  prisma: PrismaClient,
  farmId: string,
): Promise<ConnectResult> {
  const pumps = await prisma.pump.findMany({
    where: { farmId },
    select: { kind: true },
  });
  return {
    farmId,
    pumps: pumps.length,
    pumpsClassified: pumps.filter((p) => p.kind === "pump").length,
    nonPumpsClassified: pumps.filter((p) => p.kind === "non_pump").length,
  };
}

// --- the confirm step ----------------------------------------------------------

/** A field the farmer adds during confirm; wired to pumps by client-side tempId. */
export type BlockDraft = {
  tempId: string;
  name: string;
  acreage?: number | null;
  /** Crop by name; created or matched by the unique Crop.name. */
  cropName?: string | null;
};

/** Edits to an existing (imported) pump. */
export type PumpEdit = {
  id: string;
  name: string;
  kind: PumpKind;
  /** BlockDraft.tempId values this pump serves. */
  blockTempIds: string[];
  latitude?: number | null;
  longitude?: number | null;
};

/** A pump the farmer adds by hand (diesel/gas, no meter). */
export type NewPumpDraft = {
  name: string;
  powerSource: PowerSource;
  horsepower?: number | null;
  blockTempIds: string[];
  latitude?: number | null;
  longitude?: number | null;
};

export type ConfirmationPayload = {
  farmId: string;
  farmName?: string;
  blocks: BlockDraft[];
  pumps: PumpEdit[];
  newPumps: NewPumpDraft[];
};

// --- payload parsing (the actions hand us untrusted JSON from a hidden field) ---

function asRecord(v: unknown): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new Error("expected an object");
  }
  return v as Record<string, unknown>;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function reqStr(v: unknown, field: string): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`missing or empty "${field}"`);
  }
  return v.trim();
}
function optStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}
function optNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function strArray(v: unknown): string[] {
  return asArray(v).filter((x): x is string => typeof x === "string");
}
function asPumpKind(v: unknown): PumpKind {
  return v === "non_pump" ? "non_pump" : "pump";
}
function asPowerSource(v: unknown): PowerSource {
  return v === "diesel" || v === "gas" ? v : "electric";
}

/** Validate untrusted JSON into a ConfirmationPayload. Throws on a bad shape. */
export function parseConfirmationPayload(raw: unknown): ConfirmationPayload {
  const rec = asRecord(raw);
  return {
    farmId: reqStr(rec.farmId, "farmId"),
    farmName: optStr(rec.farmName) ?? undefined,
    blocks: asArray(rec.blocks).map((b) => {
      const br = asRecord(b);
      return {
        tempId: reqStr(br.tempId, "block.tempId"),
        name: reqStr(br.name, "block.name"),
        acreage: optNum(br.acreage),
        cropName: optStr(br.cropName),
      };
    }),
    pumps: asArray(rec.pumps).map((p) => {
      const pr = asRecord(p);
      return {
        id: reqStr(pr.id, "pump.id"),
        name: reqStr(pr.name, "pump.name"),
        kind: asPumpKind(pr.kind),
        blockTempIds: strArray(pr.blockTempIds),
        latitude: optNum(pr.latitude),
        longitude: optNum(pr.longitude),
      };
    }),
    newPumps: asArray(rec.newPumps).map((p) => {
      const pr = asRecord(p);
      return {
        name: reqStr(pr.name, "newPump.name"),
        powerSource: asPowerSource(pr.powerSource),
        horsepower: optNum(pr.horsepower),
        blockTempIds: strArray(pr.blockTempIds),
        latitude: optNum(pr.latitude),
        longitude: optNum(pr.longitude),
      };
    }),
  };
}

export type SaveResult = {
  farmId: string;
  blocksCreated: number;
  pumpsUpdated: number;
  pumpsCreated: number;
  /** True when onboarding was already finalized and this save was a no-op. */
  alreadyFinalized?: boolean;
};

// Crops are a shared, cross-farm catalog keyed by the unique Crop.name. Canonicalize
// before upsert so "walnut", "WALNUT", and "Walnut " all resolve to one row rather
// than fragmenting the catalog (later tools attach crop coefficients to these).
function normalizeCropName(name: string | null | undefined): string | null {
  if (!name) return null;
  const collapsed = name.trim().replace(/\s+/g, " ");
  if (collapsed === "") return null;
  // Title-case after the start and any space or hyphen ("pinot-noir" -> "Pinot-Noir"),
  // lowercasing the rest, so casing variants fold to one shared catalog name.
  return collapsed
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * Persist the confirm step in one transaction: rename the farm, create the crops and
 * blocks the farmer named, retag each pump (name, pump/non-pump, blocks, pin), add any
 * hand-entered diesel/gas pumps, and flip the PG&E Connection to active (onboarding
 * done). Crops are matched/created by their unique name so they stay shared across farms.
 */
export async function saveConfirmation(
  prisma: PrismaClient,
  payload: ConfirmationPayload,
): Promise<SaveResult> {
  return prisma.$transaction(async (tx) => {
    // The farmId arrives in untrusted client JSON: confirm the farm exists.
    const farm = await tx.farm.findUnique({
      where: { id: payload.farmId },
      include: { pumps: { select: { id: true } } },
    });
    if (!farm) throw new Error(`farm ${payload.farmId} not found`);

    // Compare-and-swap finalize. Flip the pending PG&E connection to active up front
    // and bail if nothing was pending. The conditional UPDATE takes a row lock, so two
    // concurrent submits serialize on it and only the first reaches the inserts below;
    // the body therefore never runs twice and cannot duplicate blocks/pumps (a
    // re-submit, double-click, or concurrent save is a clean no-op). Holds on SQLite
    // today and on Postgres later.
    const claim = await tx.connection.updateMany({
      where: { farmId: payload.farmId, type: PGE_SMD, status: "pending" },
      data: { status: "active", authorizedAt: new Date() },
    });
    if (claim.count === 0) {
      return {
        farmId: payload.farmId,
        blocksCreated: 0,
        pumpsUpdated: 0,
        pumpsCreated: 0,
        alreadyFinalized: true,
      };
    }

    // Only pumps that belong to this farm may be retagged (no cross-farm writes).
    const ownPumpIds = new Set(farm.pumps.map((p) => p.id));

    if (payload.farmName) {
      await tx.farm.update({
        where: { id: payload.farmId },
        data: { name: payload.farmName },
      });
    }

    // Crops are global and unique by name: upsert each named crop once (normalized).
    const cropIdByName = new Map<string, string>();
    for (const block of payload.blocks) {
      const cropName = normalizeCropName(block.cropName);
      if (!cropName || cropIdByName.has(cropName)) continue;
      const crop = await tx.crop.upsert({
        where: { name: cropName },
        update: {},
        create: { name: cropName },
      });
      cropIdByName.set(cropName, crop.id);
    }

    // Create the farmer's blocks, mapping each client tempId to its new row id.
    const blockIdByTempId = new Map<string, string>();
    for (const block of payload.blocks) {
      const cropName = normalizeCropName(block.cropName);
      const row = await tx.block.create({
        data: {
          farmId: payload.farmId,
          name: block.name,
          acreage: block.acreage,
          cropId: cropName ? cropIdByName.get(cropName) : undefined,
        },
      });
      blockIdByTempId.set(block.tempId, row.id);
    }

    const resolveBlocks = (tempIds: string[]) =>
      tempIds
        .map((t) => blockIdByTempId.get(t))
        .filter((id): id is string => id !== undefined)
        .map((id) => ({ id }));

    // Retag the imported pumps that belong to this farm.
    let pumpsUpdated = 0;
    for (const pump of payload.pumps) {
      if (!ownPumpIds.has(pump.id)) continue; // skip foreign/stale ids
      await tx.pump.update({
        where: { id: pump.id },
        data: {
          name: pump.name,
          kind: pump.kind,
          latitude: pump.latitude,
          longitude: pump.longitude,
          blocks: { set: resolveBlocks(pump.blockTempIds) },
        },
      });
      pumpsUpdated += 1;
    }

    // Add the hand-entered diesel/gas pumps.
    for (const np of payload.newPumps) {
      await tx.pump.create({
        data: {
          farmId: payload.farmId,
          name: np.name,
          kind: "pump",
          powerSource: np.powerSource,
          horsepower: np.horsepower,
          latitude: np.latitude,
          longitude: np.longitude,
          blocks: { connect: resolveBlocks(np.blockTempIds) },
        },
      });
    }

    // The connection was already flipped to active by the compare-and-swap above.
    return {
      farmId: payload.farmId,
      blocksCreated: payload.blocks.length,
      pumpsUpdated,
      pumpsCreated: payload.newPumps.length,
    };
  });
}

// --- farm resolvers the screens use --------------------------------------------

const FARM_INCLUDE = {
  people: true,
  connections: true,
  blocks: { include: { crop: true } },
  pumps: { include: { blocks: true }, orderBy: { createdAt: "asc" } },
} as const;

/**
 * The farm the tool operates on: the SIGNED-IN OPERATOR'S real (non-demo) farm with an
 * authorized PG&E connection. Owner-scoped on `Farm.userId` (set at onboarding), so one
 * grower can never resolve another grower's account - the multi-tenant isolation gate.
 * Seed/fixture demo farms (isDemo) are skipped, so a fresh install sends the grower to
 * onboarding to connect their own account instead of landing on the Batth demo.
 *
 * Without a `userId` (an unauthenticated or legacy caller) there is NO real farm to
 * resolve: the function returns null and the caller falls back to the badged
 * representative demo, so a real grower's data never surfaces on an un-owned request.
 */
export async function currentFarm(prisma: PrismaClient, userId?: string | null) {
  if (!userId) return null;
  return prisma.farm.findFirst({
    where: {
      isDemo: false,
      userId,
      connections: { some: { type: PGE_SMD, status: "active" } },
    },
    orderBy: { createdAt: "desc" },
    include: FARM_INCLUDE,
  });
}

/** Where the dashboard sources a farm and whether that data is the grower's own. */
export type DashboardFarm = {
  farm: NonNullable<Awaited<ReturnType<typeof currentFarm>>>;
  /** "real" = the grower's connected account; "representative" = the badged demo seed. */
  dataKind: "real" | "representative";
};

/**
 * The farm the dashboard renders. The signed-in operator's own connected farm
 * (currentFarm, owner-scoped on `userId`) always wins and shows no badge. When the caller
 * owns none - or passes no `userId` (an unauthenticated / legacy caller) - fall back to
 * the latest demo/seed farm (the representative Batth data) so the product is demonstrable
 * end to end, tagged so the UI shows a persistent "Representative data" badge. Null only
 * when there is no farm at all (a truly empty install), in which case the caller sends the
 * grower to onboarding.
 *
 * Pass the authenticated `userId` (from auth()) on every dashboard surface; omitting it is
 * the safe default (demo only), never a real-data leak.
 */
export async function dashboardFarm(
  prisma: PrismaClient,
  userId?: string | null,
): Promise<DashboardFarm | null> {
  const real = await currentFarm(prisma, userId);
  if (real) return { farm: real, dataKind: "real" };
  return demoFarm(prisma);
}

/**
 * The badged representative (demo) farm, resolved DIRECTLY by `isDemo` and NEVER the real
 * connected farm. The public "Tour a sample" route (Story 5.3) uses this, not
 * `dashboardFarm`, so a real grower's financials can never leak to an unauthenticated
 * visitor even when a real farm exists in the database (AC2: real financials are never
 * shown to investors). Always `dataKind:"representative"`, so the badge renders.
 */
export async function demoFarm(prisma: PrismaClient): Promise<DashboardFarm | null> {
  const demo = await prisma.farm.findFirst({
    where: { isDemo: true },
    orderBy: { createdAt: "desc" },
    include: FARM_INCLUDE,
  });
  return demo ? { farm: demo, dataKind: "representative" } : null;
}

/** A specific farm with everything the confirm screen renders. */
export async function farmForConfirm(prisma: PrismaClient, farmId: string) {
  return prisma.farm.findUnique({
    where: { id: farmId },
    include: {
      ...FARM_INCLUDE,
      pumps: {
        include: {
          blocks: true,
          intervals: { orderBy: { start: "asc" } },
          billingPeriods: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}
