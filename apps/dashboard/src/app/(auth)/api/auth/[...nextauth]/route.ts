import { handlers } from "@/lib/auth";

// The Auth.js v5 HTTP endpoint (sign-in, callback, sign-out, verify). Public per the
// allowlist in auth.config.ts. Lives in the (auth) group; resolves to /api/auth/*.
export const { GET, POST } = handlers;
