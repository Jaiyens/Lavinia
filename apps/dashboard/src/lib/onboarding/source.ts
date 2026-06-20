// The PG&E data source boundary. v1 stands in for a live Share My Data pull by
// reading a committed Green Button sample (zero external calls); the seam is shaped
// so real Self-Access auth drops in later without touching any caller. Server-side
// (fs); mirrors loadMeterReadSchedule in src/lib/greenbutton/schedule.ts.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BayouResponses, UtilityApiResponses } from "@/lib/normalize";
import { bayouConfigured, fetchBayouPull } from "@/lib/bayou/client";
import {
  getUtilityApiGreenButton,
  getUtilityApiMetersRaw,
  meterUidsFromRaw,
  utilityApiConfigured,
} from "@/lib/utilityapi/client";

/** Which committed sample feed to stand in for the live pull. */
export type SampleFeed = "onboarding-sample" | "sandhu-multi-meter" | "single-meter";

const DEFAULT_FEED: SampleFeed = "onboarding-sample";

/**
 * Read a committed Green Button XML fixture by name. Resolved from the project root
 * (process.cwd()), not import.meta.url: this runs in Next's bundled server runtime
 * (where import.meta.url points inside .next), as well as Vitest and the tsx seed,
 * which all run from the repo root. fixtures/ is shipped on Vercel via
 * outputFileTracingIncludes in next.config.ts.
 */
export function loadSampleGreenButton(feed: SampleFeed = DEFAULT_FEED): string {
  const path = join(process.cwd(), "fixtures", "greenbutton", `${feed}.xml`);
  return readFileSync(path, "utf8");
}

/** What a real Share My Data authorization looks like to this seam. */
export type GreenButtonSource = {
  /** Provider-side authorization reference (Connection.externalRef). */
  externalRef?: string | null;
  /** v1 only: which committed sample to return. */
  sampleFeed?: SampleFeed;
};

/**
 * Fetch a farm's Green Button feed as ESPI XML. v1 returns a committed sample so
 * the app runs with zero external calls; the return type (raw ESPI XML) is exactly
 * what the real pull yields, so `parseGreenButton` / `importGreenButton` are unchanged.
 *
 * The live PG&E connect now flows through UtilityAPI (see fetchUtilityApi below), which
 * already returns Green Button XML through this same normalizeEspi parser. This seam is
 * the future home of a DIRECT PG&E Share My Data integration (own the OAuth pipe, no
 * per-meter aggregator cost): implement the real Self-Access flow here (OAuth bearer
 * token from the Connection, then GET the ESPI Batch/Subscription resource) and the
 * importer/normalizer are unchanged. Deferred until the X.509 + certification burden is
 * justified; callers keep calling fetchGreenButton, only this body changes.
 */
export async function fetchGreenButton(
  source: GreenButtonSource = {},
): Promise<string> {
  return loadSampleGreenButton(source.sampleFeed ?? DEFAULT_FEED);
}

// --- Bayou path -----------------------------------------------------------------
// The second data source. Bayou returns JSON (customer + bills + intervals) instead
// of ESPI XML, but the normalize layer maps both to the same NormalizedMeter shape,
// so the importer is unchanged. v1 stands in for a live pull with the committed
// Speculoos sample (the real 200s for customer 271489; see fixtures/bayou/README.md).

/**
 * Read the committed Bayou sample pull. Resolved from process.cwd() (not
 * import.meta.url) for the same reason as loadSampleGreenButton: this runs in Next's
 * bundled server runtime as well as Vitest and the tsx seed, all from the repo root.
 * fixtures/ is shipped on Vercel via outputFileTracingIncludes in next.config.ts.
 */
export function loadSampleBayou(): BayouResponses {
  const dir = join(process.cwd(), "fixtures", "bayou");
  const read = (name: string): unknown => JSON.parse(readFileSync(join(dir, name), "utf8"));
  return {
    customer: read("customer.json"),
    bills: read("bills.json"),
    intervals: read("intervals.json"),
  };
}

/** What a real Bayou authorization looks like to this seam. */
export type BayouSource = {
  /** Bayou customer id (Connection.externalRef on the real flow). */
  customerId?: string | null;
};

/**
 * Fetch a farm's Bayou data as the three JSON responses. With a customerId and the
 * API configured (BAYOU_DOMAIN + BAYOU_API_KEY), this does the real v2 pull
 * (GET /customers/{id}{,/bills,/intervals}); without either, it returns the committed
 * Speculoos sample so tests and offline dev keep running with zero external calls.
 * Either way the return shape is identical, so normalizeBayou / importBayou are
 * unchanged. The async create-customer / await-readiness steps live in the connect
 * flow (src/lib/onboarding/farm.ts); by the time this runs the data is ready to GET.
 */
export async function fetchBayou(source: BayouSource = {}): Promise<BayouResponses> {
  if (source.customerId && bayouConfigured()) {
    return fetchBayouPull(source.customerId);
  }
  return loadSampleBayou();
}

// --- UtilityAPI path ------------------------------------------------------------
// The live PG&E connect that replaced Bayou. UtilityAPI returns a native /meters JSON
// (identity + account numbers + gas) plus a Green Button (ESPI XML) export per meter
// (intervals + billing); the hybrid normalizer (normalizeUtilityApi) merges them, so the
// importer is unchanged. v1 stands in for a live pull with a committed multi-account
// sample (fixtures/utilityapi/meters.json + the reused onboarding Green Button XML).

/**
 * Read the committed UtilityAPI sample pull: the multi-account /meters JSON plus the
 * shared onboarding Green Button XML as the per-meter interval/billing feed. Resolved
 * from process.cwd() (not import.meta.url) for the same reason as loadSampleGreenButton.
 */
export function loadSampleUtilityApi(): UtilityApiResponses {
  const meters: unknown = JSON.parse(
    readFileSync(join(process.cwd(), "fixtures", "utilityapi", "meters.json"), "utf8"),
  );
  return { meters, greenButtonXml: loadSampleGreenButton("onboarding-sample") };
}

/** What a real UtilityAPI authorization looks like to this seam. */
export type UtilityApiSource = {
  /** Authorization uids for the farm's form (resolved from the Connection's form uid). */
  authUids?: string[];
};

/**
 * What `fetchUtilityApi` returns: the pull the normalizer/importer consume, plus a count of
 * meters whose Green Button export could not be fetched (and so degraded to identity-only).
 * It is a superset of UtilityApiResponses, so it passes straight to normalizeUtilityApi /
 * importUtilityApi unchanged; callers that need to surface a degraded pull read
 * `greenButtonFailed`. Sample/offline pulls always report 0 (the fixture never fails).
 */
export type UtilityApiPull = UtilityApiResponses & {
  /** Meters whose per-meter Green Button fetch failed after retries (dropped to identity-only). */
  greenButtonFailed: number;
};

/** Max per-meter Green Button fetches in flight at once. A 183-meter farm must not open
 *  183 sockets at once (UtilityAPI rate-limits and the runtime would exhaust connections);
 *  a small pool keeps the pull bounded while still fanning out. */
const GREEN_BUTTON_CONCURRENCY = 6;
/** Retries per meter's Green Button fetch (1 initial try + this many) before giving up on
 *  that one meter and falling back to identity-only (the normalizer fills the gap from the
 *  /meters JSON, so the meter still lands, just without its interval/billing history). */
const GREEN_BUTTON_RETRIES = 2;

/** Fetch one meter's Green Button XML with a few retries; returns null if every attempt
 *  fails, so the caller can drop just that meter rather than abort the whole pull. */
async function fetchGreenButtonForMeter(uid: string): Promise<string | null> {
  for (let attempt = 0; attempt <= GREEN_BUTTON_RETRIES; attempt += 1) {
    try {
      return await getUtilityApiGreenButton(uid);
    } catch (err) {
      if (attempt === GREEN_BUTTON_RETRIES) {
        // Final failure for this meter: log the uid only (never grower data) and let the
        // caller fall back to identity-only for it. One meter must never sink the batch.
        console.error(
          `fetchUtilityApi: Green Button fetch for meter ${uid} failed after retries`,
          err instanceof Error ? err.message : err,
        );
        return null;
      }
    }
  }
  return null;
}

/** Run `fn` over `items` with at most `limit` in flight at once (bounded fan-out). */
async function boundedMap<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as T);
    }
  }
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/**
 * Fetch a farm's UtilityAPI data: the native /meters body and a Green Button export per
 * meter. With authorization uids and a token (UTILITYAPI_TOKEN), this does the real v2
 * pull; without either, it returns the committed multi-account sample so tests and
 * offline dev keep running with zero external calls. Either way the return shape is
 * identical, so normalizeUtilityApi / importUtilityApi are unchanged. The async
 * create-form / await-authorization steps live in the connect flow
 * (src/lib/onboarding/farm.ts); by the time this runs the data is ready to GET.
 *
 * The per-meter Green Button pull runs with BOUNDED concurrency and per-meter retries
 * (not an unbounded Promise.all that one rejection kills): a meter whose export cannot be
 * fetched is dropped from the XML list and the normalizer falls back to identity-only for
 * it, so a single flaky meter never aborts the whole 183-meter import. The count of dropped
 * meters is returned as `greenButtonFailed` so the caller can tell a clean pull from a
 * mostly-degraded one (and refuse to silently finalize a connect that landed no history).
 */
export async function fetchUtilityApi(
  source: UtilityApiSource = {},
): Promise<UtilityApiPull> {
  const authUids = source.authUids ?? [];
  if (authUids.length > 0 && utilityApiConfigured()) {
    const meters = await getUtilityApiMetersRaw(authUids);
    const meterUids = meterUidsFromRaw(meters);
    const fetched = await boundedMap(
      meterUids,
      GREEN_BUTTON_CONCURRENCY,
      (uid) => fetchGreenButtonForMeter(uid),
    );
    // Drop the meters whose export failed; the normalizer correlates the rest by service
    // id (order-independent) and lands the dropped ones identity-only from the JSON.
    const greenButtonXml = fetched.filter((xml): xml is string => xml !== null);
    return { meters, greenButtonXml, greenButtonFailed: meterUids.length - greenButtonXml.length };
  }
  // Sample/offline pull: the committed fixture never fails, so nothing degraded.
  return { ...loadSampleUtilityApi(), greenButtonFailed: 0 };
}
