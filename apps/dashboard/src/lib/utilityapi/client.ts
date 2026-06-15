// The live UtilityAPI v2 HTTP client. Server-only: it reads the API token from the
// environment and must never run in the browser. This is the one place that talks to
// https://utilityapi.com/api/v2; everything else (normalize, import, the screens) is
// source-agnostic and unchanged. The committed sample in fixtures/utilityapi/ stands
// in for these responses when the API is not configured, so tests and offline dev keep
// running with zero external calls (see src/lib/onboarding/source.ts).
//
// UtilityAPI replaces Bayou as the live PG&E connect: unlike Bayou (one account per
// login), one UtilityAPI authorization form can return MANY authorizations, one per
// PG&E account, so a multi-account operation (Batth: ~57 accounts) connects in one go.
//
// Auth is a Bearer token (`Authorization: Bearer <token>`), unlike Bayou's HTTP basic.
//
// SERVER ONLY. Import this only from server actions, server components, or route
// handlers, never from a "use client" file. The token is read from UTILITYAPI_TOKEN
// (no NEXT_PUBLIC_ prefix), so Next will not bundle it to the browser regardless, but
// the fetch logic still belongs only on the server.

const DEFAULT_BASE = "https://utilityapi.com/api/v2";

/** Months of history to pull on first collection. PG&E exposes up to ~3 years; one
 * year covers a full true-up cycle and every seasonal AG peak the engine reads. */
const HISTORICAL_MONTHS = 12;

function env(): { token: string | undefined; base: string } {
  return {
    token: process.env.UTILITYAPI_TOKEN,
    base: process.env.UTILITYAPI_BASE?.trim() || DEFAULT_BASE,
  };
}

/** True when UTILITYAPI_TOKEN is set, i.e. a live pull is possible. Callers fall back
 * to the committed sample when this is false. */
export function utilityApiConfigured(): boolean {
  return Boolean(env().token);
}

/** The authorization form returned by POST /forms: the hosted page the grower opens to
 * pick the accounts they share. The analogue of Bayou's onboarding_link. */
export type UtilityApiForm = {
  /** Form id; stored as Connection.externalRef so the poll can find its authorizations. */
  uid: string;
  /** Hosted authorization page (UtilityAPI redirects here; there is no JS embed). */
  url: string;
};

/** One authorization from GET /authorizations: a single PG&E account the grower shared.
 * Only the fields the connect flow reads are typed; the rest pass through. */
export type UtilityApiAuthorization = {
  uid: string;
  /** "pending" before data, "updated" once a collection succeeds, "errored"/"declined". */
  status: string;
  customer_email?: string;
};

async function utilityApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { token, base } = env();
  if (!token) {
    throw new Error(
      "UtilityAPI is not configured: set UTILITYAPI_TOKEN in the server environment.",
    );
  }
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    // Always live: this data drives onboarding state, never serve a cached body.
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `UtilityAPI ${init?.method ?? "GET"} ${path} -> ${res.status} ${res.statusText}` +
        (body ? `: ${body.slice(0, 300)}` : ""),
    );
  }
  return (await res.json()) as T;
}

/**
 * Create an authorization form. Returns its uid + hosted url; the grower opens the url,
 * signs in to PG&E there (credentials never touch Terra), and picks which accounts to
 * share. Store the uid as Connection.externalRef so the poll can list the resulting
 * authorizations. `block_recollect` keeps the form reusable; `scope`/utility default to
 * the account's UtilityAPI configuration.
 */
export async function createUtilityApiForm(
  input: { email?: string | null } = {},
): Promise<UtilityApiForm> {
  return utilityApiFetch<UtilityApiForm>("/forms", {
    method: "POST",
    body: JSON.stringify({
      customer_email: input.email ?? undefined,
      // One year of history on submit, so the meters arrive populated.
      utility_account_collection_duration: HISTORICAL_MONTHS,
    }),
  });
}

/** List the authorizations a submitted form produced, one per shared PG&E account. The
 * array is empty until the grower completes the form. */
export async function getUtilityApiAuthorizations(
  formUid: string,
): Promise<UtilityApiAuthorization[]> {
  const body = await utilityApiFetch<{ authorizations?: UtilityApiAuthorization[] }>(
    `/authorizations?forms=${encodeURIComponent(formUid)}`,
  );
  return Array.isArray(body.authorizations) ? body.authorizations : [];
}

/**
 * The raw /meters body for a set of authorizations: every meter (across every shared
 * account) with its base block (service_identifier, meter_numbers, billing_account,
 * service_class, service_tariff, service_address) and its collection status/counts.
 * Returned as `unknown` to be guarded by the normalize layer, exactly like Bayou's
 * getBayouCustomerRaw. `include=base` ensures the identity block is populated.
 */
export async function getUtilityApiMetersRaw(authUids: string[]): Promise<unknown> {
  const q = authUids.map(encodeURIComponent).join(",");
  return utilityApiFetch<unknown>(`/meters?authorizations=${q}&include=base`);
}

// --- shape-specific extraction (UtilityAPI's /meters JSON) ----------------------
// Small typed guards for the fields the live orchestration reads off the raw body.
// The full base-block -> NormalizedMeter mapping lives in src/lib/normalize/utilityapi.ts.

function metersArray(raw: unknown): Record<string, unknown>[] {
  const body = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
  const list = body?.meters;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (m): m is Record<string, unknown> => typeof m === "object" && m !== null,
  );
}

/** Meter uids for a /meters body (the keys to fetch Green Button XML and poll status). */
export function meterUidsFromRaw(raw: unknown): string[] {
  const uids: string[] = [];
  for (const m of metersArray(raw)) {
    const uid = m.uid;
    if (typeof uid === "string" && uid) uids.push(uid);
  }
  return uids;
}

/** Per-meter readiness off a /meters body: a meter is ready once a collection landed
 * (status "updated" with at least one bill or interval). Mirrors the bills/intervals
 * readiness gate Bayou exposes as booleans. */
export type UtilityApiReadyCounts = { total: number; ready: number };

export function readyCountsFromRaw(raw: unknown): UtilityApiReadyCounts {
  const meters = metersArray(raw);
  let ready = 0;
  for (const m of meters) {
    const billCount = typeof m.bill_count === "number" ? m.bill_count : 0;
    const intervalCount = typeof m.interval_count === "number" ? m.interval_count : 0;
    if (m.status === "updated" && (billCount > 0 || intervalCount > 0)) ready += 1;
  }
  return { total: meters.length, ready };
}

/**
 * Fetch a meter's Green Button (ESPI XML) export. UtilityAPI exposes per-meter exports;
 * the Green Button XML flows straight through the existing, tested normalizeEspi parser,
 * so the live path adds no new interval/billing math.
 *
 * TODO(live): confirm the exact export path against a real account. UtilityAPI lists a
 * meter's downloads under `exports`/`exports_list` (GET /meters/{uid}); the Green Button
 * entry is an authenticated XML URL. This reads that entry and fetches it. Verified
 * offline via the committed fixture (fixtures/utilityapi/ reuses a real Green Button XML);
 * the live URL shape is the one detail to smoke-test before deleting the Bayou fallback.
 */
export async function getUtilityApiGreenButton(meterUid: string): Promise<string> {
  const { token, base } = env();
  if (!token) throw new Error("UtilityAPI is not configured.");
  const meter = await utilityApiFetch<{ exports?: Record<string, unknown> }>(
    `/meters/${encodeURIComponent(meterUid)}`,
  );
  const url =
    typeof meter.exports?.greenbutton === "string"
      ? meter.exports.greenbutton
      : typeof meter.exports?.green_button === "string"
        ? meter.exports.green_button
        : `${base}/meters/${encodeURIComponent(meterUid)}/greenbutton`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/xml" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`UtilityAPI green button ${meterUid} -> ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/**
 * Trigger a historical collection for a set of meters (best-effort). The form already
 * requests history on submit; this is the explicit nudge for meters that arrived without
 * one. Failures are non-fatal: the caller polls readiness regardless.
 */
export async function triggerUtilityApiHistorical(meterUids: string[]): Promise<void> {
  if (meterUids.length === 0) return;
  try {
    await utilityApiFetch("/meters/historical-collection", {
      method: "POST",
      body: JSON.stringify({ meters: meterUids, collection_duration: HISTORICAL_MONTHS }),
    });
  } catch {
    // Non-fatal: the meters may already be collecting from the form submit.
  }
}
