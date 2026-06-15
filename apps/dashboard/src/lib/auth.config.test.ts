import { describe, expect, it } from "vitest";
import { isPublicPath } from "./auth.config";

// The middleware gate's allowlist (Story 5.1, AC3). Route groups are invisible in the
// URL, so the gate works off real paths: public = /login, /api/auth/*, and the legacy
// /dashboard/* tree; everything else is protected.
describe("isPublicPath", () => {
  it("treats the sign-in page as public", () => {
    expect(isPublicPath("/login")).toBe(true);
  });

  it("treats the public Tour a sample dashboard as public", () => {
    expect(isPublicPath("/tour")).toBe(true);
  });

  it("treats the Auth.js handler as public", () => {
    expect(isPublicPath("/api/auth/signin")).toBe(true);
    expect(isPublicPath("/api/auth/callback/google")).toBe(true);
    expect(isPublicPath("/api/auth")).toBe(true);
  });

  it("keeps the legacy /dashboard onboarding tree public (Story 5.2 replaces it)", () => {
    expect(isPublicPath("/dashboard")).toBe(true);
    expect(isPublicPath("/dashboard/pump-timing")).toBe(true);
    expect(isPublicPath("/dashboard/pump-timing/onboarding")).toBe(true);
  });

  it("protects the (app) routes (path-invisible group)", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/energy")).toBe(false);
    expect(isPublicPath("/settings")).toBe(false);
  });

  it("does not treat a lookalike prefix as the dashboard, login, or auth handler", () => {
    // A path that merely starts with the letters but is a different segment must NOT pass.
    expect(isPublicPath("/dashboards-public")).toBe(false);
    expect(isPublicPath("/login-help")).toBe(false);
    expect(isPublicPath("/api/authxyz")).toBe(false);
  });
});
