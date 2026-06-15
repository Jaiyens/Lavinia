// The live Bayou v2 HTTP client. Server-only: it reads the API key from the
// environment and must never run in the browser. This is the one place that talks
// to https://{BAYOU_DOMAIN}/api/v2; everything else (normalize, import, the screens)
// is source-agnostic and unchanged. The committed Speculoos fixtures in
// fixtures/bayou/ stand in for these responses when the API is not configured, so
// tests and offline dev keep running with zero external calls (see source.ts).
//
// Auth is HTTP basic with the API key as the username and a blank password
// (`Authorization: Basic base64("<key>:")`), exactly the curl in the fixtures README.
//
// SERVER ONLY. Import this only from server actions, server components, or route
// handlers, never from a "use client" file. The key is read from BAYOU_API_KEY (no
// NEXT_PUBLIC_ prefix), so Next will not bundle it to the browser regardless, but the
// fetch logic still belongs only on the server.

import type { BayouResponses } from "@/lib/normalize";

/** Real PG&E utility code: the default once BAYOU_DOMAIN points at the live API. */
const DEFAULT_PGE_UTILITY = "pacific_gas_and_electric";

/** Bayou's fake "demo" utility on the staging sandbox. Has no real login: the
 * Speculoos test logins (see README) return canned accounts, so dev and the
 * quickstart run against it with zero real PG&E exposure. */
const SPECULOOS_UTILITY = "speculoos_power";

/** The customer object as returned by POST /customers and GET /customers/{id}.
 * Only the fields the connect flow reads are typed; the rest pass through. The full
 * record (account_numbers[].meters[] ...) is consumed downstream by normalizeBayou. */
export type BayouCustomer = {
  id: number;
  /** Hosted page the customer uses to enter utility credentials. */
  onboarding_link: string;
  /** Token for the embedded onboarding component (Bayou.loadOnboardingForm). */
  onboarding_token: string;
  /** Credentials submitted (login accepted). */
  has_filled_credentials: boolean;
  /** Bill history pulled and ready to GET. */
  bills_are_ready: boolean;
  /** Interval (15-min usage) history pulled and ready to GET. */
  intervals_are_ready: boolean;
  /** Login is still valid (false after a password change / expired MFA). */
  is_currently_authenticated: boolean;
};

/** One supported utility from GET /utilities (used to confirm the PG&E code). */
export type BayouUtility = {
  id: number;
  name: string;
  /** The string passed as `utility` when creating a customer. */
  api_identifier?: string;
  identifier?: string;
};

function env(): { domain: string | undefined; apiKey: string | undefined } {
  return { domain: process.env.BAYOU_DOMAIN, apiKey: process.env.BAYOU_API_KEY };
}

/** True when BAYOU_DOMAIN + BAYOU_API_KEY are set, i.e. a live pull is possible.
 * Callers fall back to the committed sample when this is false. */
export function bayouConfigured(): boolean {
  const { domain, apiKey } = env();
  return Boolean(domain && apiKey);
}

/**
 * The Bayou utility code to create customers under. UTILITY overrides everything;
 * with no override the default follows BAYOU_DOMAIN so flipping from the staging
 * sandbox to real PG&E needs no code change, only the env switch we already make:
 * - staging.bayou.energy (dev / quickstart) -> speculoos_power (Bayou's fake utility)
 * - bayou.energy (prod)                      -> pacific_gas_and_electric (real PG&E)
 */
export function bayouUtility(): string {
  const explicit = process.env.UTILITY?.trim();
  if (explicit) return explicit;
  const staging = process.env.BAYOU_DOMAIN?.includes("staging") ?? false;
  return staging ? SPECULOOS_UTILITY : DEFAULT_PGE_UTILITY;
}

function authHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

async function bayouFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { domain, apiKey } = env();
  if (!domain || !apiKey) {
    throw new Error(
      "Bayou is not configured: set BAYOU_DOMAIN and BAYOU_API_KEY in the server environment.",
    );
  }
  const res = await fetch(`https://${domain}/api/v2${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(apiKey),
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
      `Bayou ${init?.method ?? "GET"} ${path} -> ${res.status} ${res.statusText}` +
        (body ? `: ${body.slice(0, 300)}` : ""),
    );
  }
  return (await res.json()) as T;
}

/** Create a customer for a given utility. Returns the id + the onboarding token/link
 * the grower uses to enter their PG&E login. Store the id as Connection.externalRef. */
export async function createBayouCustomer(input: {
  utility?: string;
  email?: string | null;
}): Promise<BayouCustomer> {
  return bayouFetch<BayouCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify({
      utility: input.utility ?? bayouUtility(),
      ...(input.email ? { email: input.email } : {}),
    }),
  });
}

/** Read a customer's current state (the readiness booleans the poller checks). */
export async function getBayouCustomer(id: string | number): Promise<BayouCustomer> {
  return bayouFetch<BayouCustomer>(`/customers/${id}`);
}

/**
 * The full, raw customer record (account_numbers[].meters[] ...), for normalizeBayou.
 * getBayouCustomer types only the readiness booleans the poller reads; the reveal
 * needs the untyped body so it can count accounts and meters off the same normalizer
 * the importer uses. Returns it as `unknown`, to be guarded by the normalize layer.
 */
export async function getBayouCustomerRaw(id: string | number): Promise<unknown> {
  return bayouFetch<unknown>(`/customers/${id}`);
}

/** Pull the three responses normalizeBayou consumes. Call only once a customer's
 * bills_are_ready and intervals_are_ready are true. */
export async function fetchBayouPull(id: string | number): Promise<BayouResponses> {
  const [customer, bills, intervals] = await Promise.all([
    bayouFetch<unknown>(`/customers/${id}`),
    bayouFetch<unknown>(`/customers/${id}/bills`),
    bayouFetch<unknown>(`/customers/${id}/intervals`),
  ]);
  return { customer, bills, intervals };
}

/** Live bill parse counts for the onboarding progress UI. */
export type BayouBillCounts = { total: number; usable: number; unparsed: number };

/**
 * Count a customer's bills by parse status. Bayou marks bills it fetched but could not
 * read as "unparsed"; the rest carry usable data. Used to show "X of Y bills ready"
 * while the pull runs, so the grower can see progress (or that it has stalled).
 */
export async function getBayouBillCounts(id: string | number): Promise<BayouBillCounts> {
  const bills = await bayouFetch<Array<{ status?: string }>>(`/customers/${id}/bills`);
  const arr = Array.isArray(bills) ? bills : [];
  let unparsed = 0;
  for (const b of arr) if (b?.status === "unparsed") unparsed += 1;
  return { total: arr.length, usable: arr.length - unparsed, unparsed };
}

/** List Bayou's supported utilities. Handy one-off to confirm the exact PG&E code
 * for UTILITY (the slug is account-visible, not in the public docs). */
export async function listBayouUtilities(): Promise<BayouUtility[]> {
  return bayouFetch<BayouUtility[]>("/utilities");
}
