import { expect, test } from "@playwright/test";

// Story 5.2 moved the canonical onboarding into the gated (app) group at /onboarding (the
// connect-a-source flow). It is auth-gated like the rest of (app); the FULL authenticated
// click-through (identify -> connect PG&E -> confirm -> dashboard) is proven by the
// source-edge DB-integration test (src/lib/onboarding/sources.db.test.ts) and a live
// dev.db check, since establishing a JWT session in headless Playwright is out of
// proportion here. This spec pins the routing: the new flow is protected, and the legacy
// /dashboard onboarding stays public (dormant) so nothing 5.1 relied on broke.
test("the new connect-a-source onboarding is auth-gated", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/login(\?|$)/);
});

test("the legacy onboarding stays public and renders", async ({ page }) => {
  await page.goto("/dashboard/pump-timing");
  await expect(page).toHaveURL(/\/dashboard\/pump-timing\/onboarding$/);
  await expect(
    page.getByRole("heading", { name: /See what your power is actually costing you/ }),
  ).toBeVisible();
});
