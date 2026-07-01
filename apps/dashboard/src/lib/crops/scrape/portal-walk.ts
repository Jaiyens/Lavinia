// The Almond Logic portal-API walk, ported from the local crawler (scripts/scrape-almond-logic.ts)
// into a PURE, transport-injected module so the walk logic is unit-tested with no browser. The portal
// is a login-gated JSON API (no public contract); the walk issues the SAME sequence the SPA issues -
// account enumeration, then deliveries/runs for the ONE huller we read (Sierra Valley Holding, per the
// brief), then handler assignments - and captures each raw response for R2.
//
// Two seams keep it testable:
//   - PortalTransport: "call endpoint with params -> { status, json, raw }". In production it is
//     pageTransport(), which runs `fetch` INSIDE the authenticated portal page (same cookies, origin,
//     and X-Requested-With header as the site's own XHR). In tests it is a fake map over fixtures.
//   - The health guard (assertPortalShape) fails CLOSED on any shape change (endpoint error, no
//     hullers, or SVH absent) by throwing SourceChangedError, so a broken portal writes NOTHING.
//
// Determinism: this module reads no clock and does no I/O of its own; every external call goes through
// the injected transport. It never logs a cookie or credential (only endpoints + non-secret params).

import { createHash } from "node:crypto";
import { assertPortalShape, type HullerRef } from "./portal-health";
import type { RawPage } from "./types";

/** sha-256 hex of bytes (content-addressing for R2). Local so this module does not import from
 *  sandbox-scrape, which imports walkPortal from here — keeping the dependency one-directional. */
function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The grower portal's JSON API base (same origin the SPA calls). */
export const PORTAL_API_BASE = "https://almondlogic.com/portals/grower/api";

/** One transport response: the HTTP status, the parsed JSON (null if unparseable), and the raw text
 *  (the exact bytes to archive to R2; falls back to the re-serialized JSON when a fake omits it). */
export type PortalResponse = { status: number; json: unknown; raw?: string };

/** Call one portal endpoint with query params. The single boundary the walk touches the network through. */
export type PortalTransport = (
  endpoint: string,
  params: Record<string, string | number>,
) => Promise<PortalResponse>;

/** A handler (packer) reference from getHandlers.php. Same minimal shape as a huller. */
export type HandlerRef = { id: number; name: string; cropYears: readonly number[] };

export type PortalWalkResult = {
  growerId: string;
  cropYear: number;
  /** The Sierra Valley Holding huller the deliveries/runs were read from (SVH only, per the brief). */
  svhHuller: HullerRef;
  handlers: readonly HandlerRef[];
  /** Every captured response as raw bytes, ready for content-addressed R2 storage. */
  pages: RawPage[];
};

/** The account-level endpoints, called once with no params (mirrors the local crawler's order). */
const ACCOUNT_ENDPOINTS = [
  "getUserInfo.php",
  "getHullers.php",
  "getHandlers.php",
  "getRecentActivity.php",
  "getGrowerReports.php",
] as const;

/** Endpoints whose failure is a SOURCE CHANGE (we cannot proceed without them). The other two account
 *  endpoints are best-effort: captured when present, never fatal. */
const REQUIRED_ENDPOINTS = new Set(["getUserInfo.php", "getHullers.php", "getHandlers.php"]);

/** A response is an error iff the HTTP status is not 200 or the JSON body carries an `error` field. */
function isError(res: PortalResponse): boolean {
  if (res.status !== 200) return true;
  return (
    res.json !== null &&
    typeof res.json === "object" &&
    typeof (res.json as { error?: unknown }).error === "string"
  );
}

/** Parse an enumeration payload (getHullers / getHandlers) into refs, dropping any malformed row. Never
 *  trusts the shape: a non-array or a row missing id/name/cropYears yields [] / is skipped. */
function asHubs(json: unknown): { id: number; name: string; cropYears: number[] }[] {
  if (!Array.isArray(json)) return [];
  const out: { id: number; name: string; cropYears: number[] }[] = [];
  for (const raw of json) {
    if (raw === null || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (typeof row.id !== "number" || typeof row.name !== "string" || !Array.isArray(row.cropYears)) {
      continue;
    }
    const cropYears = (row.cropYears as unknown[]).filter((y): y is number => typeof y === "number");
    out.push({ id: row.id, name: row.name, cropYears });
  }
  return out;
}

/** Build the query string the local crawler uses (stable order from the params object). */
function queryString(params: Record<string, string | number>): string {
  return new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
}

/** Turn one captured response into a content-addressed RawPage (JSON bytes -> R2). */
function toRawPage(
  endpoint: string,
  params: Record<string, string | number>,
  res: PortalResponse,
): RawPage {
  const qs = queryString(params);
  const url = `${PORTAL_API_BASE}/${endpoint}${qs ? `?${qs}` : ""}`;
  const bytes = new TextEncoder().encode(res.raw ?? JSON.stringify(res.json));
  return { url, sha: sha256Hex(bytes), contentType: "application/json", bytes };
}

/**
 * Build a PortalTransport that issues the request from INSIDE an authenticated portal page (identical
 * to the SPA's own XHR: same cookies, origin, referer, and X-Requested-With header). Structural
 * `PortalPage` type so this module never imports Playwright — the real Playwright Page satisfies it,
 * and a fake page drives it in tests.
 */
export type PortalPage = {
  url(): string;
  evaluate<T>(fn: (arg: string) => T | Promise<T>, arg: string): Promise<T>;
};

export function pageTransport(page: PortalPage): PortalTransport {
  return async (endpoint, params) => {
    const qs = queryString(params);
    const url = `${PORTAL_API_BASE}/${endpoint}${qs ? `?${qs}` : ""}`;
    return page.evaluate(async (u): Promise<PortalResponse> => {
      const r = await fetch(u, {
        credentials: "include",
        headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
      });
      const text = await r.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: r.status, json, raw: text.slice(0, 200_000) };
    }, url);
  };
}

/**
 * Walk the grower portal for ONE crop year and return the raw captured pages + the SVH huller. Order:
 *   1. account enumeration (getUserInfo / getHullers / getHandlers / getRecentActivity / getGrowerReports),
 *   2. assertPortalShape -> the Sierra Valley Holding huller, failing closed on any source change,
 *   3. deliveries + runs for SVH at the target crop year (SVH ONLY - all other hullers ignored),
 *   4. web assignments per handler at the target crop year.
 * A required-endpoint error, an empty huller list, or a missing SVH raises SourceChangedError (the
 * caller records a failed run and writes nothing). Never re-sums or invents a number; it only captures.
 */
export async function walkPortal(
  transport: PortalTransport,
  opts: { growerId: string; cropYear: number },
): Promise<PortalWalkResult> {
  const { growerId, cropYear } = opts;
  const pages: RawPage[] = [];
  const endpointErrors: string[] = [];

  const call = async (endpoint: string, params: Record<string, string | number>): Promise<PortalResponse> => {
    let res: PortalResponse;
    try {
      res = await transport(endpoint, params);
    } catch {
      res = { status: 0, json: { error: "fetch_failed" } };
    }
    pages.push(toRawPage(endpoint, params, res));
    return res;
  };

  const byEndpoint = new Map<string, PortalResponse>();
  for (const endpoint of ACCOUNT_ENDPOINTS) {
    const res = await call(endpoint, {});
    byEndpoint.set(endpoint, res);
    if (REQUIRED_ENDPOINTS.has(endpoint) && isError(res)) {
      endpointErrors.push(`${endpoint} HTTP ${res.status}`);
    }
  }

  const hullers: HullerRef[] = asHubs(byEndpoint.get("getHullers.php")?.json);
  const handlers: HandlerRef[] = asHubs(byEndpoint.get("getHandlers.php")?.json);

  // Fail closed on any source change; returns the SVH huller when healthy.
  const svhHuller = assertPortalShape(hullers, endpointErrors);

  // Deliveries + runs for the SVH huller at the target year (the bulk of the yield data). SVH ONLY.
  await call("getDeliveries.php", { hullerId: svhHuller.id, growerId, cropYear });
  await call("getRuns.php", { hullerId: svhHuller.id, growerId, cropYear });

  // Handler-level commitments/assignments per handler at the target year.
  for (const handler of handlers) {
    await call("getWebAssignments.php", { handlerId: handler.id, growerId, cropYear });
  }

  return { growerId, cropYear, svhHuller, handlers, pages };
}
