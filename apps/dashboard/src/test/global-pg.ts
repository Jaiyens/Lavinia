import { execFileSync } from "node:child_process";
import net from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Vitest global setup: spin up ONE throwaway local PostgreSQL cluster for the whole db-test
// run, then tear it down. Each *.db.test.ts file creates its own isolated database on this
// cluster via src/test/pg-harness.ts (the Postgres analogue of the old per-file SQLite file).
// Nothing here touches the dev/prod Neon database — it is a temp cluster under the OS tmpdir.
//
// Connection info is handed to the test workers through a small JSON file (workers are forked
// processes, so a file is the simplest cross-process channel).

export const PG_INFO_FILE = join(tmpdir(), "terra-test-pg.json");

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

export default async function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), "terra-pg-data-"));
  const sockDir = mkdtempSync(join(tmpdir(), "terra-pg-sock-"));
  const port = await freePort();

  // Trust auth (local throwaway cluster, no network exposure), superuser `postgres`.
  execFileSync("initdb", ["-D", dataDir, "-U", "postgres", "--auth=trust", "-E", "UTF8"], {
    stdio: "pipe",
  });
  // Listen on localhost:port + a private socket dir; wait for readiness.
  execFileSync(
    "pg_ctl",
    // max_connections raised: many *.db.test.ts files run in parallel, each with its own pool.
    ["-D", dataDir, "-o", `-p ${port} -k ${sockDir} -c max_connections=300`, "-l", join(dataDir, "server.log"), "-w", "start"],
    { stdio: "pipe" },
  );

  writeFileSync(PG_INFO_FILE, JSON.stringify({ port, dataDir, sockDir }));

  return async () => {
    try {
      execFileSync("pg_ctl", ["-D", dataDir, "-m", "immediate", "stop"], { stdio: "pipe" });
    } catch {
      // best-effort shutdown
    }
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(sockDir, { recursive: true, force: true });
    rmSync(PG_INFO_FILE, { force: true });
  };
}
