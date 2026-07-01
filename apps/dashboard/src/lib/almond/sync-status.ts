// The shared status contract for the "Sync from Almond Logic" button, so the client UI is written
// once against one shape regardless of whether the sync runs locally (dev: detached child process +
// status file) or in production (a crop_scrape AgentRun). Pure types + helpers, safe in client +
// server (no Node-only imports). `message` is curated operator copy, NEVER a secret/credential.

export type AlmondSyncPhase = "idle" | "starting" | "scraping" | "loading" | "done" | "error";

export type AlmondSyncErrorKind =
  | "login_required"
  | "session_expired"
  | "network"
  | "timeout"
  | "unknown";

export type AlmondSyncStatus = {
  phase: AlmondSyncPhase;
  startedAt: number; // epoch ms
  updatedAt: number;
  apiCallsDone: number;
  apiCallsTotal: number | null; // null until hullers enumerated
  snapshots: number;
  deliveries: number;
  errorKind: AlmondSyncErrorKind | null;
  message: string | null; // plain operator English; never a secret
  source: "dev_local" | "sandbox" | "cron";
};

export function initialStatus(
  source: AlmondSyncStatus["source"],
  now: number,
): AlmondSyncStatus {
  return {
    phase: "starting",
    startedAt: now,
    updatedAt: now,
    apiCallsDone: 0,
    apiCallsTotal: null,
    snapshots: 0,
    deliveries: 0,
    errorKind: null,
    message: null,
    source,
  };
}

export function isRunning(phase: AlmondSyncPhase): boolean {
  return phase === "starting" || phase === "scraping" || phase === "loading";
}

export function isTerminal(phase: AlmondSyncPhase): boolean {
  return phase === "done" || phase === "error";
}
