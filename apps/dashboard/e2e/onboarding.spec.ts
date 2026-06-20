import { expect, test } from "@playwright/test";

// Story 5.2 moved the canonical onboarding into the gated (app) group at /onboarding (the
// connect-a-source flow). It is auth-gated like the rest of (app); the FULL authenticated
// click-through (identify -> connect PG&E -> confirm -> dashboard) is proven by the
// source-edge DB-integration test (src/lib/onboarding/sources.db.test.ts) and a live
// dev.db check, since establishing a JWT session in headless Playwright is out of
// proportion here. This spec pins the routing: the new flow is protected, and the legacy
// /dashboard tree is now ALSO protected (it previously leaked any farm's findings).
test("the new connect-a-source onboarding is auth-gated", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/login(\?|$)/);
});

test("the legacy /dashboard tree is no longer public (now sign-in gated)", async ({ page }) => {
  // Removed from isPublicPath: an unauthenticated visit redirects to sign-in instead of
  // rendering the dormant legacy onboarding (which sat in front of the cross-farm leak).
  await page.goto("/dashboard/pump-timing");
  await expect(page).toHaveURL(/\/login(\?|$)/);
});
