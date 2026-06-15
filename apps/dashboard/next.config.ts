import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is a Next.js Multi-Zone mounted under /dashboard on tryterra.ai. The web
  // app (apps/web) rewrites /dashboard/* to this app's deployment. basePath keeps this
  // app's pages and /_next assets under /dashboard so they never collide with web's.
  // NOTE: keep src/lib/base-path.ts BASE_PATH in sync with this value.
  basePath: "/dashboard",
  // Server code reads committed fixtures from ./fixtures at runtime (the rate card,
  // the onboarding feed stand-ins, later the meter-read schedule). Next's file tracer
  // does not see process.cwd() reads, so include fixtures for EVERY server route.
  // (In the monorepo, Turbopack infers the workspace root from the single root
  // lockfile + workspaces field, so the old turbopack.root pin is no longer needed.)
  outputFileTracingIncludes: {
    "/**": ["./fixtures/**/*"],
  },
};

export default nextConfig;
