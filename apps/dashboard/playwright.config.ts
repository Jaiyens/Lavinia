import { defineConfig, devices } from "@playwright/test";

// End-to-end check for the onboarding flow. Runs the real app (server actions and
// all) against a THROWAWAY SQLite db so it never touches prisma/dev.db. The db is
// recreated empty each run, so the tool redirects into onboarding (no farm yet).
const PORT = 3210;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Bring up a throwaway local Postgres, push the (empty) schema, then run `next start`
    // against it. The wrapper owns the DB lifecycle and tears it down on shutdown. `next
    // start` (not dev) so it coexists with any running `next dev`; `test:e2e` runs `next
    // build` first. The empty db sends the app into login/onboarding, exactly as before.
    command: "node scripts/e2e-with-pg.mjs",
    // Health check the public sign-in page. Since Story 5.1 gated the (app) group, "/"
    // 307-redirects to /login for an unauthenticated request; /login is public and
    // returns 200, so it is the stable readiness probe.
    url: `http://localhost:${PORT}/login`,
    timeout: 120_000,
    reuseExistingServer: false,
    // AUTH_SECRET is REQUIRED by Auth.js under `next start` (it throws without one). This is
    // a throwaway test value (the wrapper also defaults it). DATABASE_URL is set by the
    // wrapper to its local Postgres, so it is intentionally not pinned here.
    env: {
      AUTH_SECRET: "e2e-throwaway-not-a-real-secret-00000000000000",
    },
  },
});
