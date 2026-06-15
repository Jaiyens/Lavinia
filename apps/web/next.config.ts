import type { NextConfig } from "next";

// The marketing site is a standalone app on the apex domain (tryterra.ai). The farmer
// dashboard lives on its own subdomain (app.tryterra.ai) as a separate Vercel project, so
// there is no cross-zone rewrite here — the "Farmer Login" button links straight to it.
const nextConfig: NextConfig = {};

export default nextConfig;
