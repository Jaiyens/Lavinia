import { expect, test } from "@playwright/test";

// Almond's chat endpoint is farm-scoped and auth-gated (Story 6.1): the farm is resolved from
// the session, so an unauthenticated caller can never reach any farm's data. We pin that
// security boundary here at the e2e layer (same spirit as auth.spec.ts).
//
// The interactive panel click-through (open launcher -> tap a starter -> see a streamed,
// grounded answer) runs against the OFFLINE stub responder and is covered deterministically by
// the stub-responder DB integration test (src/lib/almond/tools.db.test.ts, which asserts the
// stub streams a grounded answer naming the real farm). Driving that flow in-browser needs an
// authenticated session + a seeded farm; this project deliberately covers authed/demo dashboard
// behavior at the *.db.test.ts layer rather than in Playwright (see the e2e/auth.spec.ts note),
// so we do not mint a session here.
test("the Almond chat endpoint rejects unauthenticated requests", async ({ request }) => {
  const res = await request.post("/api/almond/chat", { data: { messages: [] } });
  expect(res.status()).toBe(401);
});

test("the Almond launcher is not exposed on the public sign-in page", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /open almond/i })).toHaveCount(0);
});

test("the dedicated Almond page renders on the public tour with a model picker", async ({ page }) => {
  await page.goto("/tour/almond");
  // The Notion-style greeting hero.
  await expect(page.getByRole("heading", { name: /how can i help you today/i })).toBeVisible();
  // A grower can switch models (the curated picker is present on both surfaces).
  await expect(page.getByRole("combobox", { name: /choose which model answers/i })).toBeVisible();
  // Attachments are owner-only (capability parity with export/report); the public Tour cannot attach.
  await expect(page.getByRole("button", { name: /attach a pdf/i })).toHaveCount(0);
});
