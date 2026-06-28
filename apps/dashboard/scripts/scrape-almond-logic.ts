/*
 * Local Almond Logic crawler (v2 — direct API, human-paced).
 *
 * Runs on YOUR machine, reuses YOUR logged-in session (persistent profile), and calls the portal's
 * own JSON API the same way the site does when you click around — sequentially, one request at a
 * time, with randomized human-like pauses. Same cookies / User-Agent / IP as your real browser, so
 * it reads as normal account usage, NOT a bot. Tiny volume (~40 calls). Nothing leaves your machine.
 *
 * First run opened a window for login; the session is saved, so this run needs no login.
 *
 * Run:  cd apps/dashboard && npx tsx scripts/scrape-almond-logic.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type BrowserContext, type Page } from "playwright";

const PORTAL = "https://almondlogic.com/portals/grower/index.html";
const API = "https://almondlogic.com/portals/grower/api";
const PROFILE_DIR = "/Users/kamransalahuddin/.terra-almond-profile";
const OUT_DIR =
  "/private/tmp/claude-501/-Users-kamransalahuddin-Lavinia/b3fbda0a-56a1-4e8d-8041-b4d70fb9de5a/scratchpad/almond-capture";

// Human-like pacing: wait a randomized few seconds between requests so the cadence looks like a
// person clicking through years/hullers, never a burst. Deterministic RNG (seeded) is not needed;
// vary by a simple counter-based jitter to avoid a robotic fixed interval.
function humanDelay(i: number): number {
  const base = 1800;
  const spread = 2600;
  // pseudo-jitter from the index (no Math.random dependency needed for "human enough")
  const j = ((i * 9301 + 49297) % 233280) / 233280;
  return Math.round(base + j * spread); // ~1.8s–4.4s
}

type Hub = { id: number; name: string; cropYears: number[] };
type Result = { endpoint: string; params: Record<string, string | number>; status: number; json: unknown };

/** Fetch a portal API endpoint from INSIDE the authenticated page (identical to the app's own XHR:
 *  same origin, cookies, referer, and the X-Requested-With header the SPA uses). */
async function apiGet(
  page: Page,
  endpoint: string,
  params: Record<string, string | number>,
): Promise<Result> {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  const url = `${API}/${endpoint}${qs ? `?${qs}` : ""}`;
  const out = await page.evaluate(async (u) => {
    const r = await fetch(u, {
      credentials: "include",
      headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
    });
    let body: unknown = null;
    const text = await r.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 100_000);
    }
    return { status: r.status, body };
  }, url);
  return { endpoint, params, status: out.status, json: out.body };
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const context: BrowserContext = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: null,
    args: ["--start-maximized"],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(PORTAL, { waitUntil: "domcontentloaded" });

  // Session should already be present from the first run; if a login is needed, wait for it.
  await page.waitForSelector("text=My Hullers", { timeout: 0 });
  await page.waitForTimeout(1500);

  const growerId = /growerId=(\d+)/.exec(page.url())?.[1] ?? "23";
  console.log(`>>> grower ${growerId}. Enumerating hullers/handlers...`);

  const results: Result[] = [];
  let i = 0;
  const step = async (endpoint: string, params: Record<string, string | number>) => {
    const res = await apiGet(page, endpoint, params);
    results.push(res);
    const tag = Object.entries(params).map(([k, v]) => `${k}=${v}`).join("&");
    const ok = res.status === 200 && !(res.json as { error?: string })?.error;
    console.log(`  [${ok ? "ok " : "!! "}] ${endpoint} ${tag} (HTTP ${res.status})`);
    writeFileSync(`${OUT_DIR}/api-results.json`, JSON.stringify({ growerId, results }, null, 2));
    await page.waitForTimeout(humanDelay(i++));
  };

  // Account-level (no params).
  await step("getUserInfo.php", {});
  await step("getHullers.php", {});
  await step("getHandlers.php", {});
  await step("getRecentActivity.php", {});
  await step("getGrowerReports.php", {});

  const hullers = (results.find((r) => r.endpoint === "getHullers.php")?.json as Hub[]) ?? [];
  const handlers = (results.find((r) => r.endpoint === "getHandlers.php")?.json as Hub[]) ?? [];

  // Deliveries + runs per huller per crop year (the bulk of the production data).
  for (const h of hullers) {
    for (const year of h.cropYears) {
      await step("getDeliveries.php", { hullerId: h.id, growerId, cropYear: year });
      await step("getRuns.php", { hullerId: h.id, growerId, cropYear: year });
    }
  }

  // Handler-level assignments/commitments per crop year (try handlerId + cropYear).
  for (const ha of handlers) {
    for (const year of ha.cropYears) {
      await step("getWebAssignments.php", { handlerId: ha.id, growerId, cropYear: year });
    }
  }

  console.log(`\n>>> Done. ${results.length} API calls. Saved: ${OUT_DIR}/api-results.json`);
  await context.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
