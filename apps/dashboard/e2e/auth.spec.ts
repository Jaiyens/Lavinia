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

// The 6-digit code flow stays on ONE screen: entering an email swaps the email form for the
// code-entry step in place (no magic link, no new tab). RESEND_API_KEY is unset in the e2e env,
// so the code is "sent" via the offline stub (no network) while the VerificationToken is written
// to the throwaway db, exactly as in production minus the email transport.
test("entering an email advances to the in-place 6-digit code step", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("grower@example.com");
  await page.getByRole("button", { name: "Email me a code" }).click();

  // Same screen, step two: the code-entry form, with the email carried through.
  await expect(page).toHaveURL(/[?&]step=code/);
  await expect(page).toHaveURL(/grower%40example\.com/);
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await expect(page.getByLabel("6-digit code")).toBeVisible();
  await expect(page.getByRole("button", { name: "Verify and sign in" })).toBeVisible();

  // Recover without leaving the screen: resend a fresh code, or change the email.
  await expect(page.getByRole("button", { name: "Send a new code" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Use a different email" })).toBeVisible();
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
