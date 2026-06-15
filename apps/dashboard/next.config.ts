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
};

export default nextConfig;
