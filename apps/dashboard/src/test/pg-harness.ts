import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

// Per-test-file Postgres database, the replacement for the old throwaway SQLite file. Each
// *.db.test.ts calls createTestDb() in beforeAll to get an isolated database on the shared
// local cluster started by src/test/global-pg.ts, then calls cleanup() in afterAll. Isolated
// databases (not schemas) keep test files independent and parallel-safe.

const PG_INFO_FILE = join(tmpdir(), "terra-test-pg.json");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const prismaBin = join(repoRoot, "node_modules", ".bin", "prisma");

function clusterPort(): number {
  const info = JSON.parse(readFileSync(PG_INFO_FILE, "utf8")) as { port: number };
  return info.port;
}

function adminUrl(port: number): string {
  // Trust auth on the throwaway cluster, superuser `postgres`, maintenance db `postgres`.
  return `postgresql://postgres@localhost:${port}/postgres`;
}

export type TestDb = { prisma: PrismaClient; url: string; cleanup: () => Promise<void> };

/** Create a fresh isolated database on the local test cluster, push the schema, and return a
 *  client bound to it plus a cleanup that disconnects and drops the database. */
export async function createTestDb(): Promise<TestDb> {
  const port = clusterPort();
  const name = `t_${randomUUID().replace(/-/g, "")}`;
  const admin = adminUrl(port);

  execFileSync("psql", [admin, "-v", "ON_ERROR_STOP=1", "-q", "-c", `CREATE DATABASE "${name}"`], {
    stdio: "pipe",
  });

  const url = `postgresql://postgres@localhost:${port}/${name}`;
  // Push the schema into the fresh database. directUrl is required by the datasource block, so
  // set both to the same local url (no pooler in tests).
  execFileSync(prismaBin, ["db", "push", "--skip-generate", "--accept-data-loss"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url },
    stdio: "pipe",
  });

  const prisma = new PrismaClient({ datasources: { db: { url } } });

  return {
    prisma,
    url,
    async cleanup() {
      await prisma.$disconnect();
      // FORCE terminates any lingering connections (pg13+); IF EXISTS keeps teardown idempotent.
      execFileSync("psql", [admin, "-q", "-c", `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`], {
        stdio: "pipe",
      });
    },
  };
}
