import { expect, test } from "@playwright/test";

// Story 5.1: the (app) group is gated, the (auth) group is public. Runs against the
// throwaway e2e db (empty) under `next start`, which requires AUTH_SECRET (set in
// playwright.config webServer env) - so this also proves the app boots with Auth.js wired.
test("unauthenticated request to the dashboard redirects to the sign-in page", async ({
  page,
}) => {
  // The (app) home is protected; with no session the middleware sends us to /login
  // (Auth.js appends a callbackUrl for the post-login return).
  await page.goto("/");
  await expect(page).toHaveURL(/\/login(\?|$)/);

  // The sign-in surface renders: heading + the passwordless email code-request form.
  await expect(page.getByRole("heading", { name: "Sign in to Terra" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a code" })).toBeVisible();

  // No Google creds in the e2e env, so the Google button is conditionally hidden (the
  // build/e2e must not depend on Google credentials).
  await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
});

test("the energy route is also gated", async ({ page }) => {
  await page.goto("/energy");
  await expect(page).toHaveURL(/\/login(\?|$)/);
});

// Story 5.3: "Tour a sample" is PUBLIC (zero commitment, no sign-in), unlike the gated
// dashboard. The login page links to it. (The empty e2e db has no demo seed, so the page
// shows the no-farm state rather than the badge; the badge + demo-pinning are covered by
// src/lib/dashboard/demo.db.test.ts.)
test("the Tour a sample dashboard is public (no sign-in required)", async ({ page }) => {
  await page.goto("/tour");
  await expect(page).toHaveURL(/\/tour$/);
  await expect(page.getByRole("link", { name: "Connect your farm" })).toBeVisible();
});

test("the login page links to the public tour", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Tour a sample" })).toBeVisible();
});
