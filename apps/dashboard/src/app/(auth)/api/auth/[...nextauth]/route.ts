import { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";

// The Auth.js v5 HTTP endpoint (sign-in, callback, sign-out, verify). Public per the
// allowlist in auth.config.ts. Lives in the (auth) group; resolves to /api/auth/*.
//
// MULTI-ZONE basePath fix. This app runs under the Next.js basePath "/dashboard" (it is a
// Multi-Zone behind tryterra.ai/dashboard), and Next STRIPS that prefix before this handler
// runs, so the request arrives as "/api/auth/*". Auth.js is configured with basePath
// "/dashboard/api/auth" (so the callback/sign-in URLs it generates keep the "/dashboard"
// prefix). With the prefix stripped from the request, Auth.js cannot parse the action and
// 400s (UnknownAction). So we RE-ADD "/dashboard" to the request URL before handing off:
// parsing then matches the basePath, and URL generation (origin + basePath) is unaffected.
const ZONE_BASE_PATH = "/dashboard";

function withZoneBasePath(req: NextRequest): NextRequest {
  const url = new URL(req.url);
  if (url.pathname.startsWith(`${ZONE_BASE_PATH}/`)) return req;
  url.pathname = `${ZONE_BASE_PATH}${url.pathname}`;
  return new NextRequest(url, req);
}

export function GET(req: NextRequest) {
  return handlers.GET(withZoneBasePath(req));
}

export function POST(req: NextRequest) {
  return handlers.POST(withZoneBasePath(req));
}
