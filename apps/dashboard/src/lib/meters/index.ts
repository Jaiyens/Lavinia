// Barrel for the CLIENT-SAFE Meters logic. Everything re-exported here is pure (no node:fs), so
// client components can import from "@/lib/meters" freely. The two fs-bound / server-only modules
// are imported by their own paths, never re-exported here, so they never reach the browser bundle:
//   - ./generate (the representative feed; reads the rate card via ./rate) -> imported by the
//     SERVER page only.
//   - ./rate (loadRateCard, node:fs) -> imported by ./generate only.
// The data-source seam is types.ts (MetersFeed); the live feed will be a sibling of generate.ts
// implementing the same interface.

export * from "./config";
export * from "./types";
export * from "./risk";
export * from "./group";
export * from "./read";
export * from "./board";
export * from "./curve";
