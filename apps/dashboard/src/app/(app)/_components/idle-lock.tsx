"use client";

import { useEffect } from "react";

// Step-away / tab-close session lock (safety). The auth cookie already clears when the whole
// BROWSER closes (auth.config.ts browser-session cookie); this adds the in-between case the
// founder asked for: if you LEAVE a tab - switch away from it or close it - and come back after
// a short window, you have to sign in again. An OPEN, in-use tab is NEVER interrupted: any
// interaction, or a foreground heartbeat, keeps it alive, so an active operator is never kicked
// out mid-session.
//
// Pure client guard. The actual sign-out (clearing the httpOnly cookie) is done server-side at
// /api/lock, which this navigates to when the tab is found stale.
//
// `loginAtMs` is the server-known sign-in time. A brand-new sign-in is exempt from the
// first-load staleness check so a fresh login can never bounce straight back to /login.

const LAST_SEEN_KEY = "terra.session.lastSeen";
// Come back to a tab you stepped away from for longer than this -> re-authenticate.
const IDLE_LOCK_MS = 15 * 60 * 1000;
// A sign-in newer than this is treated as brand-new (never locked on first load).
const FRESH_LOGIN_MS = 2 * 60 * 1000;
// Foreground keep-alive cadence: while the tab is visible it stays signed in.
const HEARTBEAT_MS = 60 * 1000;

export function IdleLock({ loginAtMs }: { loginAtMs: number | null }) {
  useEffect(() => {
    const read = (): number => {
      try {
        return Number(localStorage.getItem(LAST_SEEN_KEY)) || 0;
      } catch {
        return 0;
      }
    };
    const touch = (): void => {
      try {
        localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
      } catch {
        /* private mode / storage disabled: degrade to no lock rather than crash */
      }
    };
    const isStale = (): boolean => {
      const last = read();
      return last > 0 && Date.now() - last > IDLE_LOCK_MS;
    };
    const isFreshLogin = (): boolean =>
      loginAtMs !== null && Date.now() - loginAtMs < FRESH_LOGIN_MS;
    const lock = (): void => {
      try {
        localStorage.removeItem(LAST_SEEN_KEY);
      } catch {
        /* ignore */
      }
      window.location.replace("/api/lock");
    };

    // First load in THIS tab. A stale timestamp means the tab was reopened after being away;
    // lock it - unless this is a brand-new sign-in (then just start the clock).
    if (isStale() && !isFreshLogin()) {
      lock();
      return;
    }
    touch();

    const onActivity = (): void => touch();
    const onVisibility = (): void => {
      if (document.visibilityState !== "visible") return;
      // Returned to a tab that was away long enough -> lock; otherwise keep it alive.
      if (isStale() && !isFreshLogin()) lock();
      else touch();
    };

    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    document.addEventListener("visibilitychange", onVisibility);
    // Only heartbeat while visible; a hidden/closed tab is allowed to go stale.
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === "visible") touch();
    }, HEARTBEAT_MS);

    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(heartbeat);
    };
  }, [loginAtMs]);

  return null;
}
