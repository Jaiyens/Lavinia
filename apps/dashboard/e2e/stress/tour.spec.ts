import { test, expect, type Page } from "@playwright/test";

// Stress click-through of the PUBLIC Tour (no auth/DB needed): exercise the real UI the way a farmer
// would and FAIL on any browser console error or uncaught page error. This is the "click everything"
// layer that curl + static audits can't cover (MapLibre, hydration, dead handlers, runtime throws).

// Known-benign console noise to ignore (dev-mode / third-party); everything else is a failure.
const BENIGN = [
  "Download the React DevTools",
  "[Fast Refresh]",
  "Failed to load resource: the server responded with a status of 404", // favicon etc.
  "favicon",
  "ResizeObserver loop",
  "MapLibre", // tile/attribution info logs are not errors; real style errors throw as pageerror
];

function attachGuards(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (BENIGN.some((b) => text.includes(b))) return;
    errors.push(`console.error: ${text}`);
  });
  page.on("pageerror", (err) => {
    const text = err.message;
    if (BENIGN.some((b) => text.includes(b))) return;
    errors.push(`pageerror: ${text}`);
  });
  return errors;
}

test.describe("Tour stress click-through", () => {
  test("parcels: search, blocks, market, color-by, my-farm, zoom, drawer", async ({ page }) => {
    const errors = attachGuards(page);
    await page.goto("/tour/parcels");

    // Map controls first, while nothing is covering the bottom-right (a drawer overlays that corner).
    const myFarm = page.getByRole("button", { name: /my farm/i });
    await expect(myFarm).toBeVisible();
    await myFarm.click();
    await page.waitForTimeout(1000);

    const colorBy = page.locator("#colorBy");
    if (await colorBy.count()) {
      await colorBy.selectOption("tenure").catch(() => {});
      await colorBy.selectOption("crop").catch(() => {});
    }

    const zoomIn = page.getByRole("button", { name: /zoom in/i });
    if (await zoomIn.count()) {
      await zoomIn.click();
      await page.waitForTimeout(500);
    }

    // Search: address, APN, junk. Each match opens the parcel drawer; close it before the next.
    const search = page.getByPlaceholder(/search/i);
    await expect(search).toBeVisible();
    const closeDrawer = async () => {
      const dialog = page.getByRole("dialog");
      if (await dialog.count()) {
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(400);
      }
    };
    await search.fill("Caruthers CA");
    await search.press("Enter");
    await page.waitForTimeout(2500);
    await closeDrawer();
    await search.fill("04117038S"); // an APN
    await search.press("Enter");
    await page.waitForTimeout(2500);
    await closeDrawer();
    await search.fill("zzzznotathing"); // junk -> graceful "no match"
    await search.press("Enter");
    await page.waitForTimeout(1200);
    await closeDrawer();

    // Click the first "Your blocks" card -> drawer opens -> close.
    const firstBlock = page.locator("button").filter({ hasText: /APN/i }).first();
    if (await firstBlock.count()) {
      await firstBlock.click();
      await page.waitForTimeout(1500);
      await closeDrawer();
    }

    // Market tab -> click a comp -> close any drawer it opens.
    const marketTab = page.getByRole("button", { name: /^market$/i });
    if (await marketTab.count()) {
      await marketTab.click();
      await page.waitForTimeout(500);
      const comp = page.locator("button").filter({ hasText: /\/ac/ }).first();
      if (await comp.count()) {
        await comp.click();
        await page.waitForTimeout(1500);
        await closeDrawer();
      }
    }

    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("energy meters: table search, group, peak-kW, click -> load-curve graph", async ({ page }) => {
    const errors = attachGuards(page);
    await page.goto("/tour/energy");
    await page.waitForTimeout(800);

    // Switch to the Table lens (where the meter list lives).
    const tableTab = page.getByRole("button", { name: /^table$/i }).first();
    if (await tableTab.count()) {
      await tableTab.click();
      await page.waitForTimeout(500);
    }

    // Search for meters by name.
    const search = page.getByPlaceholder(/search meters/i);
    if (await search.count()) {
      await search.fill("pump");
      await page.waitForTimeout(400);
      await search.fill("");
      await page.waitForTimeout(300);
    }

    // Toggle group-by-group.
    const groupBtn = page.getByRole("button", { name: /group by group/i }).first();
    if (await groupBtn.count()) {
      await groupBtn.click();
      await page.waitForTimeout(400);
      await groupBtn.click();
      await page.waitForTimeout(300);
    }

    // Open a meter -> the drawer with the intra-day load-curve graph -> close.
    const firstMeter = page.getByRole("button", { name: /open .* detail|open meter/i }).first();
    if (await firstMeter.count()) {
      await firstMeter.click();
      await page.waitForTimeout(800);
      const dialog = page.getByRole("dialog");
      if (await dialog.count()) {
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(400);
      }
    }

    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("home + energy: nav, links, almond launcher", async ({ page }) => {
    const errors = attachGuards(page);
    await page.goto("/tour");
    await page.waitForTimeout(800);

    // Navigate to energy via a link/nav if present, else direct.
    const energyLink = page.getByRole("link", { name: /energy/i }).first();
    if (await energyLink.count()) {
      await energyLink.click();
      await page.waitForLoadState("networkidle").catch(() => {});
    } else {
      await page.goto("/tour/energy");
    }
    await page.waitForTimeout(800);

    // The Almond launcher (Ask Almond) should at least be clickable without throwing.
    const almond = page.getByRole("button", { name: /almond/i }).first();
    if (await almond.count()) {
      await almond.click().catch(() => {});
      await page.waitForTimeout(800);
      await page.keyboard.press("Escape").catch(() => {});
    }

    expect(errors, errors.join("\n")).toEqual([]);
  });
});
