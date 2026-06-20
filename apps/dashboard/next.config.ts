import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server code reads committed fixtures from ./fixtures at runtime (the rate card, the
  // onboarding feed stand-ins, the meter-read schedule). Next's file tracer does not see
  // process.cwd() reads, so include fixtures for EVERY server route. (In the monorepo,
  // Turbopack infers the workspace root from the single root lockfile + workspaces field,
  // so the old turbopack.root pin is not needed.)
  outputFileTracingIncludes: {
    "/**": ["./fixtures/**/*"],
  },
  experimental: {
    serverActions: {
      // The onboarding upload actions (Green Button XML, the master meter CSV, a bill
      // PDF/photo) receive their file through a Server Action. Next's default request-body
      // cap is 1 MB, which a real full-year PG&E Green Button export or a multi-page bill
      // PDF blows past - the request would be rejected at the framework boundary BEFORE the
      // action runs, so useActionState never sees the calm inline error and the grower hits
      // an opaque failure. Raise the ceiling so real onboarding uploads reach the handler;
      // the actions themselves enforce a friendly per-file size guard below this.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
