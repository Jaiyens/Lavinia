import { describe, expect, it } from "vitest";
import { parseEncryptedCredential, rowToScrapeAuth } from "./credential-store";

const BLOB = { ciphertext: "Y2lwaGVy", iv: "aXY=", authTag: "dGFn" };
const NOW = 1_800_000_000_000; // fixed injected clock

describe("parseEncryptedCredential — trust nothing from the DB column", () => {
  it("accepts a well-formed blob", () => {
    expect(parseEncryptedCredential(BLOB)).toEqual(BLOB);
  });

  it("rejects null / non-object / missing or non-string fields", () => {
    expect(parseEncryptedCredential(null)).toBeNull();
    expect(parseEncryptedCredential("nope")).toBeNull();
    expect(parseEncryptedCredential({ ciphertext: "x", iv: "y" })).toBeNull(); // no authTag
    expect(parseEncryptedCredential({ ciphertext: 1, iv: "y", authTag: "z" })).toBeNull();
  });
});

describe("rowToScrapeAuth — map a stored row to reachable auth", () => {
  it("returns the encrypted credential when present (no cookie)", () => {
    const auth = rowToScrapeAuth(
      { encryptedCredential: BLOB, sessionCookie: null, sessionCookieExpiresAt: null },
      NOW,
    );
    expect(auth).not.toBeNull();
    expect(auth?.encryptedCredential).toEqual(BLOB);
    expect(auth?.sessionCookie).toBeNull();
  });

  it("forwards a live (unexpired) cookie", () => {
    const auth = rowToScrapeAuth(
      {
        encryptedCredential: null,
        sessionCookie: "SID=abc",
        sessionCookieExpiresAt: new Date(NOW + 60_000),
      },
      NOW,
    );
    expect(auth?.sessionCookie).toBe("SID=abc");
    expect(auth?.sessionCookieExpiresAt).toBe(NOW + 60_000);
  });

  it("DROPS an expired cookie so the branch selector falls back to a fresh login", () => {
    // Expired cookie AND a stored credential -> cookie dropped, credential kept.
    const auth = rowToScrapeAuth(
      {
        encryptedCredential: BLOB,
        sessionCookie: "SID=stale",
        sessionCookieExpiresAt: new Date(NOW - 1),
      },
      NOW,
    );
    expect(auth?.sessionCookie).toBeNull();
    expect(auth?.encryptedCredential).toEqual(BLOB);
  });

  it("returns null when nothing is usable (no valid credential, expired/absent cookie)", () => {
    expect(
      rowToScrapeAuth(
        {
          encryptedCredential: null,
          sessionCookie: "SID=stale",
          sessionCookieExpiresAt: new Date(NOW - 1),
        },
        NOW,
      ),
    ).toBeNull();
    expect(
      rowToScrapeAuth(
        { encryptedCredential: { bogus: true }, sessionCookie: null, sessionCookieExpiresAt: null },
        NOW,
      ),
    ).toBeNull();
  });

  it("treats a cookie with no expiry as live (portal session cookies can be session-scoped)", () => {
    const auth = rowToScrapeAuth(
      { encryptedCredential: null, sessionCookie: "SID=abc", sessionCookieExpiresAt: null },
      NOW,
    );
    expect(auth?.sessionCookie).toBe("SID=abc");
    expect(auth?.sessionCookieExpiresAt).toBeNull();
  });
});
