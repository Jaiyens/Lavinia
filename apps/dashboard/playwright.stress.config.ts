import { defineConfig, devices } from "@playwright/test";

// Stress click-through config: drives the ALREADY-RUNNING dev server (npm run dev:dashboard on
// :3001) through the public Tour routes, with no webServer/DB of its own. Separate from
// playwright.config.ts (which builds + boots a throwaway Postgres for the auth/onboarding specs).
//   Run:  npx playwright test --config playwright.stress.config.ts
const PORT = 3001;

export default defineConfig({
  testDir: "./e2e/stress",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
