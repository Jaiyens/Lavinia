// The ONLY new module in the energy lib allowed to read process.env, so the pure
// back-test-config.ts stays importable from anywhere (client included). Server
// edges that want the founder-tunable band resolve it HERE, then hand a plain
// number into the pure config/lever functions. Keeping this seam thin (one env
// read, one validation) is what lets the rest of the energy core stay pure.

import { DEFAULT_BACK_TEST_BAND_PCT } from "./back-test-config";

/**
 * The resolved aggregate back-test band, in percent. Reads
 * `TERRA_BACK_TEST_BAND_PCT`, parses it, and accepts it ONLY when it is finite
 * and strictly positive; anything else (unset, empty, NaN, zero, negative,
 * Infinity) falls back to DEFAULT_BACK_TEST_BAND_PCT. Fail-safe by construction:
 * a fat-fingered env never widens the band to "trust everything" or collapses it
 * to "trust nothing"; it just reverts to the conservative default.
 */
export function resolvedBandPct(): number {
  const raw = process.env.TERRA_BACK_TEST_BAND_PCT;
  if (raw === undefined || raw.trim() === "") return DEFAULT_BACK_TEST_BAND_PCT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BACK_TEST_BAND_PCT;
  return parsed;
}
