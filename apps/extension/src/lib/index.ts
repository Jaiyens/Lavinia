// Barrel for the pure, browser-free probe logic. The service worker imports
// from here; the tests import the individual modules directly.
export { buildCookieHeader, type CookiePair } from "./cookie";
export {
  buildScrapeRequest,
  type FirecrawlScrapeBody,
} from "./scrape-request";
export { classifyResponse, type ScrapeClassification } from "./classify";
