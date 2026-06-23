import { expect, test } from "@playwright/test";

// The Agents audit area (the agentic foundation). Like the rest of the (app) group it is
// auth-gated; the FULL authenticated behaviour — an OWNER seeing one-tap Approve/Reject on a
// proposed action and a NON-OWNER (viewer) seeing it read-only — is proven by the approval
// DB-integration test (src/lib/agents/approval.db.test.ts), which exercises the ownership
// chokepoint directly. Establishing a real JWT session and seeding an AgentRun in headless
// Playwright is out of proportion here (the same reasoning the onboarding spec records), so
// this spec pins the routing gate: /agents is protected and an anonymous visit bounces to
// the sign-in page. This also proves the route compiles and the app boots with it wired.
test("the Agents audit area is auth-gated", async ({ page }) => {
  await page.goto("/agents");
  await expect(page).toHaveURL(/\/login(\?|$)/);
});
