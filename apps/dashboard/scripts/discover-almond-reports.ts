/*
 * Local Almond Logic REPORT-endpoint discovery (run on YOUR machine).
 *
 * DISCOVERY ONLY. The portal's report / PDF endpoints are UNKNOWN: getGrowerReports.php returns
 * HTTP 400 with an empty body (see the captured api-results.json), so the report requests are issued
 * ONLY when you drive the Reports panel in the UI. This script does NOT guess those endpoints — it
 * OBSERVES them: it registers response listeners, then clicks through the Reports panel so the portal
 * issues its real report requests, and records every URL whose content-type is application/pdf or
 * whose path matches /report|RunReport|\.pdf/i. The output is a {report, urlTemplate, params} list you
 * then hand to the live scrape lib. Until this is RUN against the live portal, the report endpoints
 * are not known.
 *
 * Reuses the exact human-paced, persistent-profile pattern from scrape-almond-logic.ts (same logged-in
 * session, same cookies / User-Agent / IP, tiny volume, randomized pauses) so it reads as normal
 * account usage, never a bot. This is a SEPARATE file: it never imports or mutates
 * scrape-almond-logic.ts.
 *
 * Run:  cd apps/dashboard && npx tsx scripts/discover-almond-reports.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type BrowserContext, type Page, type Response } from "playwright";

const PORTAL = "https://almondlogic.com/portals/grower/index.html";
const API = "https://almondlogic.com/portals/grower/api";
const PROFILE_DIR = "/Users/kamransalahuddin/.terra-almond-profile";
const OUT_DIR =
  "/private/tmp/claude-501/-Users-kamransalahuddin-Lavinia/b3fbda0a-56a1-4e8d-8041-b4d70fb9de5a/scratchpad/almond-capture";

// What marks a response as a candidate report/PDF request. Path heuristic is deliberately broad so a
// differently-named endpoint (RunReport.aspx, report.php, *.pdf, a /reports/ path) is still caught.
const REPORT_PATH = /report|RunReport|\.pdf(\?|$)/i;
const PDF_CONTENT_TYPE = /application\/pdf/i;

// Human-like pacing (copied intent from scrape-almond-logic.ts): vary by a counter-based jitter so
// the cadence looks like a person clicking through the Reports panel, never a burst.
function humanDelay(i: number): number {
  const base = 1800;
  const spread = 2600;
  const j = ((i * 9301 + 49297) % 233280) / 233280;
  return Math.round(base + j * spread); // ~1.8s–4.4s
}

/** One observed candidate report request. urlTemplate strips the query so params are listed separately. */
type Observed = {
  report: string; // a human label (the last path segment, best-effort)
  method: string;
  urlTemplate: string; // URL without the query string
  params: Record<string, string>; // parsed query params
  contentType: string;
  status: number;
};

/** Parse one Response into the Observed shape (query split out into params). */
function observe(res: Response): Observed {
  const url = new URL(res.url());
  const params: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const segments = url.pathname.split("/").filter(Boolean);
  const report = segments[segments.length - 1] ?? url.pathname;
  return {
    report,
    method: res.request().method(),
    urlTemplate: `${url.origin}${url.pathname}`,
    contentType: res.headers()["content-type"] ?? "",
    status: res.status(),
    params,
  };
}

/** Fetch getGrowerReports.php from INSIDE the page (same XHR shape the SPA uses) and dump its body. */
async function dumpGrowerReports(page: Page): Promise<unknown> {
  const url = `${API}/getGrowerReports.php`;
  return page.evaluate(async (u) => {
    const r = await fetch(u, {
      credentials: "include",
      headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
    });
    const text = await r.text();
    let body: unknown = text.slice(0, 100_000);
    try {
      body = JSON.parse(text);
    } catch {
      // keep the raw text
    }
    return { status: r.status, body };
  }, url);
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const context: BrowserContext = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: null,
    args: ["--start-maximized"],
    // Accept PDF downloads so a report that downloads (rather than renders) still surfaces its URL.
    acceptDownloads: true,
  });
  const page = context.pages()[0] ?? (await context.newPage());

  // Register the listeners BEFORE navigating so nothing is missed. Every report/PDF-looking response
  // is recorded; the file is rewritten after each so a crash still leaves what was seen.
  const observed: Observed[] = [];
  const record = (res: Response) => {
    const ct = res.headers()["content-type"] ?? "";
    const isPdf = PDF_CONTENT_TYPE.test(ct);
    const looksReport = REPORT_PATH.test(res.url());
    if (!isPdf && !looksReport) return;
    observed.push(observe(res));
    writeFileSync(
      `${OUT_DIR}/report-endpoints.json`,
      JSON.stringify({ note: "discovery output: verify against the live portal", observed }, null, 2),
    );
    console.log(`  [seen] ${res.request().method()} ${res.url()} (${res.status()}, ${ct})`);
  };
  page.on("response", record);
  // A report may arrive as a navigation/download rather than an XHR; catch downloads too.
  page.on("download", (d) => {
    console.log(`  [download] ${d.url()} -> ${d.suggestedFilename()}`);
  });

  await page.goto(PORTAL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=My Hullers", { timeout: 0 }); // wait for the session (login if needed)
  await page.waitForTimeout(1500);

  // First: dump getGrowerReports.php (captured but unused historically; record its body verbatim).
  const growerReports = await dumpGrowerReports(page);
  writeFileSync(`${OUT_DIR}/getGrowerReports.json`, JSON.stringify(growerReports, null, 2));
  console.log(`>>> getGrowerReports.php status=${(growerReports as { status?: number }).status}`);

  // Drive the Reports panel so the portal issues its real report requests. The exact UI affordances
  // are unknown until run — we open the Reports view, then click each visible report/View control and
  // pause (human-paced) so any PDF/report request is observed by the listener above.
  await openReportsPanel(page);

  // Click through every plausible report trigger we can find. Each click may issue a report request
  // the listener records. Best-effort + paced; missing one is fine (re-run after inspecting the page).
  const triggers = await page
    .getByRole("link", { name: /report|view|pdf|download|statement|settlement|commitment/i })
    .all()
    .catch(() => []);
  const buttons = await page
    .getByRole("button", { name: /report|view|pdf|download|run|statement|settlement|commitment/i })
    .all()
    .catch(() => []);
  const clickable = [...triggers, ...buttons];
  console.log(`>>> ${clickable.length} candidate report controls found; clicking through (paced)...`);

  let i = 0;
  for (const el of clickable) {
    try {
      await el.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
      await el.click({ timeout: 4000, trial: false });
    } catch {
      // a control that isn't actually clickable is fine — keep going
    }
    await page.waitForTimeout(humanDelay(i++));
  }

  // Give late responses a moment to land, then finish.
  await page.waitForTimeout(3000);

  console.log(
    `\n>>> Done. ${observed.length} report/PDF responses observed.\n` +
      `    -> ${OUT_DIR}/report-endpoints.json  (the {report, urlTemplate, params} list)\n` +
      `    -> ${OUT_DIR}/getGrowerReports.json\n` +
      `    NOTE: endpoints are DISCOVERY output. Verify each against the live portal before wiring.`,
  );
  await context.close();
}

/**
 * Open the Reports panel. The portal labels it "Viewing Reports" / "Reports" (see the captured
 * sidebar-texts.json). Try a few selectors; if none match, log so you can inspect the live DOM.
 */
async function openReportsPanel(page: Page): Promise<void> {
  const candidates = [
    page.getByRole("link", { name: /reports/i }),
    page.getByRole("button", { name: /reports/i }),
    page.getByText(/viewing reports/i),
    page.getByText(/^reports$/i),
  ];
  for (const locator of candidates) {
    try {
      const el = locator.first();
      if (await el.isVisible({ timeout: 2000 })) {
        await el.click({ timeout: 4000 });
        await page.waitForTimeout(1500);
        console.log(">>> Opened the Reports panel.");
        return;
      }
    } catch {
      // try the next candidate
    }
  }
  console.log(
    ">>> Could not auto-open a Reports panel. The portal DOM may differ — inspect it and click " +
      "Reports manually; the response listener will still record any report/PDF request.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
