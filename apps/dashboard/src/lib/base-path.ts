/**
 * This app is mounted as a Next.js Multi-Zone under `/dashboard` on tryterra.ai
 * (see `basePath` in next.config.ts). Next prefixes Link/router/asset URLs with the
 * basePath automatically, but NOT manual `fetch`/transport URLs, so anything that
 * hits an app-absolute route (e.g. an /api endpoint) must prefix it itself.
 *
 * Keep this constant in sync with `basePath` in next.config.ts.
 */
export const BASE_PATH = "/dashboard";

/** Prefix an app-absolute path (e.g. "/api/almond/chat") with the zone basePath. */
export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
