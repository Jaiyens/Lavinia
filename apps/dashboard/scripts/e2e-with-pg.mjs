// Playwright e2e web server wrapper: bring up a throwaway local PostgreSQL cluster, push the
// schema into an empty `e2e` database (so the app boots into login/onboarding exactly like the
// old SQLite e2e), then run `next start` against it. On shutdown (Playwright SIGTERMs this
// command), stop Postgres and clean up. Never touches the dev/prod Neon database.
import { execFileSync, spawn } from "node:child_process";
import net from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
  });

const dataDir = mkdtempSync(join(tmpdir(), "terra-e2e-pg-"));
const sockDir = mkdtempSync(join(tmpdir(), "terra-e2e-sock-"));
const pgPort = await freePort();
let child = null;
let cleaned = false;

function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try {
    if (child) child.kill("SIGTERM");
  } catch {}
  try {
    execFileSync("pg_ctl", ["-D", dataDir, "-m", "immediate", "stop"], { stdio: "pipe" });
  } catch {}
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(sockDir, { recursive: true, force: true });
}
for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(sig, () => {
    cleanup();
    process.exit(0);
  });
}
process.on("exit", cleanup);

execFileSync("initdb", ["-D", dataDir, "-U", "postgres", "--auth=trust", "-E", "UTF8"], {
  stdio: "pipe",
});
execFileSync(
  "pg_ctl",
  ["-D", dataDir, "-o", `-p ${pgPort} -k ${sockDir}`, "-l", join(dataDir, "server.log"), "-w", "start"],
  { stdio: "pipe" },
);
execFileSync("psql", [`postgresql://postgres@localhost:${pgPort}/postgres`, "-q", "-c", "CREATE DATABASE e2e"], {
  stdio: "pipe",
});

const dbUrl = `postgresql://postgres@localhost:${pgPort}/e2e`;
const env = {
  ...process.env,
  DATABASE_URL: dbUrl,
  DATABASE_URL_UNPOOLED: dbUrl,
  AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-throwaway-not-a-real-secret-00000000000000",
  // Keep e2e hermetic: force the Google provider OFF regardless of the developer's .env.local,
  // so the run never depends on real OAuth creds (the provider only registers when BOTH are
  // set). Empty strings are "defined", so @next/env won't override them from .env.local.
  AUTH_GOOGLE_ID: "",
  AUTH_GOOGLE_SECRET: "",
};

execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
  env,
  stdio: "pipe",
});

// Hand off to next start; mirror its output so Playwright's readiness probe works.
child = spawn("npx", ["next", "start", "-p", "3210"], { env, stdio: "inherit" });
child.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});
