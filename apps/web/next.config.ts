import type { NextConfig } from "next";

// Next.js Multi-Zones: the marketing site (this app) is the primary zone serving
// tryterra.ai, and it rewrites /dashboard/* to the dashboard zone (apps/dashboard).
// In dev that's the local dashboard on :3001; in prod set DASHBOARD_URL to the
// dashboard's Vercel deployment URL (e.g. https://lavinia-dashboard.vercel.app).
const DASHBOARD_URL = process.env.DASHBOARD_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/dashboard", destination: `${DASHBOARD_URL}/dashboard` },
      { source: "/dashboard/:path*", destination: `${DASHBOARD_URL}/dashboard/:path*` },
    ];
  },
};

export default nextConfig;
