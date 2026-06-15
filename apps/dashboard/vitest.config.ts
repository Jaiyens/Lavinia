import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // One throwaway local Postgres cluster for the whole run; *.db.test.ts files each create
    // an isolated database on it via src/test/pg-harness.ts. Pure *.test.ts files don't touch
    // it. Generous hook timeout: the first db push waits on cluster init.
    globalSetup: ["./src/test/global-pg.ts"],
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
