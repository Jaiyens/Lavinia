// `npm run preview:seeded` — a one-command, fully-populated LOCAL Almond test environment.
// Brings up a throwaway local Postgres, pushes the schema, SEEDS the Batth demo farm, then runs
// `next dev` against it. Uses your .env.local for everything EXCEPT the database (so the live
// Almond model key is picked up, but the app talks to the throwaway DB, never Neon). Ctrl+C tears
// the database down. The seeded demo means /tour works with no login — including export + PDF now,
// which a guest can pull of the demo farm (streamed, not saved). Signing in (magic link prints to
// THIS terminal) only adds owner persistence: the export is also kept in the grower's Reports.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";

const APP = new URL("..", import.meta.url).pathname;
const freePort = () =>
  new Promise((res) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });

const APP_PORT = Number(process.env.PREVIEW_PORT) || 3008;
const pgPort = await freePort();
const dataDir = mkdtempSync(join(tmpdir(), "terra-preview-pg-"));
const sockDir = mkdtempSync(join(tmpdir(), "terra-preview-sock-"));
let child = null, cleaned = false;

function cleanup() {
  if (cleaned) return; cleaned = true;
  console.log("\n[preview] shutting down + dropping the throwaway database...");
  try { if (child) child.kill("SIGTERM"); } catch {}
  try { execFileSync("pg_ctl", ["-D", dataDir, "-m", "immediate", "stop"], { stdio: "pipe" }); } catch {}
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(sockDir, { recursive: true, force: true });
}
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { cleanup(); process.exit(0); });
process.on("exit", cleanup);

const dbUrl = `postgresql://postgres@localhost:${pgPort}/preview`;
// DATABASE_URL is set HERE so it wins over .env.local (@next/env never overrides an already-set
// var). Every other env (the Almond model key, auth) still comes from .env.local.
const env = { ...process.env, DATABASE_URL: dbUrl, DATABASE_URL_UNPOOLED: dbUrl };

console.log("[preview] starting a throwaway Postgres (never touches Neon)...");
execFileSync("initdb", ["-D", dataDir, "-U", "postgres", "--auth=trust", "-E", "UTF8"], { stdio: "pipe" });
execFileSync("pg_ctl", ["-D", dataDir, "-o", `-p ${pgPort} -k ${sockDir}`, "-l", join(dataDir, "s.log"), "-w", "start"], { stdio: "pipe" });
execFileSync("psql", [`postgresql://postgres@localhost:${pgPort}/postgres`, "-q", "-c", "CREATE DATABASE preview"], { stdio: "pipe" });
console.log("[preview] pushing schema + seeding the Batth demo farm...");
execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], { env, stdio: "pipe", cwd: APP });
execFileSync("npx", ["prisma", "db", "seed"], { env, stdio: "inherit", cwd: APP });

console.log("\n========================================================================");
console.log(`  Almond preview is starting at:  http://localhost:${APP_PORT}`);
console.log(`  - No login, FULL test (read + navigate + Excel + PDF):  http://localhost:${APP_PORT}/tour`);
console.log(`  - Signed-in owner (exports also save to Reports):       http://localhost:${APP_PORT}  -> sign in`);
console.log("    (the magic-link sign-in URL prints in THIS terminal)");
console.log("  Ctrl+C to stop and drop the database.");
console.log("========================================================================\n");

// `next start` (not dev) stays in the foreground, so this script keeps owning the DB lifecycle.
// `npm run preview:seeded` runs `next build` first; if you call the script directly, build once.
child = spawn("npx", ["next", "start", "-p", String(APP_PORT)], { env, stdio: "inherit", cwd: APP });
child.on("exit", (code) => { cleanup(); process.exit(code ?? 0); });
