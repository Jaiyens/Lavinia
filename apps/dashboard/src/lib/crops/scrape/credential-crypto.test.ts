import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encryptCredential, decryptCredential } from "./sandbox-scrape";

// A deterministic 32-byte test key (never a real key). Round-trip tests set it on the env the way
// the runtime reads CROP_CRED_ENC_KEY; a fresh random IV per encrypt means ciphertext varies, so we
// assert the round-trip and structural properties, not a fixed ciphertext.
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

describe("encryptCredential / decryptCredential round-trip (AES-256-GCM)", () => {
  const prior = process.env.CROP_CRED_ENC_KEY;
  beforeAll(() => {
    process.env.CROP_CRED_ENC_KEY = TEST_KEY;
  });
  afterAll(() => {
    if (prior === undefined) delete process.env.CROP_CRED_ENC_KEY;
    else process.env.CROP_CRED_ENC_KEY = prior;
  });

  it("decrypt(encrypt(x)) === x", () => {
    const cred = { username: "gagan@batthfarms.example", password: "s3cr3t-p@ss word" };
    const blob = encryptCredential(cred);
    expect(decryptCredential(blob)).toEqual(cred);
  });

  it("produces base64 ciphertext/iv/authTag and a fresh IV each call", () => {
    const cred = { username: "u", password: "p" };
    const a = encryptCredential(cred);
    const b = encryptCredential(cred);
    for (const blob of [a, b]) {
      expect(typeof blob.ciphertext).toBe("string");
      expect(Buffer.from(blob.iv, "base64").byteLength).toBe(12);
      expect(Buffer.from(blob.authTag, "base64").byteLength).toBe(16);
    }
    // Same plaintext, different IV -> different ciphertext (no deterministic leak).
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("rejects a tampered blob (GCM auth fails)", () => {
    const blob = encryptCredential({ username: "u", password: "p" });
    const flipped = Buffer.from(blob.authTag, "base64");
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    expect(() => decryptCredential({ ...blob, authTag: flipped.toString("base64") })).toThrow();
  });
});

describe("credential crypto without a key", () => {
  const prior = process.env.CROP_CRED_ENC_KEY;
  beforeAll(() => {
    delete process.env.CROP_CRED_ENC_KEY;
  });
  afterAll(() => {
    if (prior !== undefined) process.env.CROP_CRED_ENC_KEY = prior;
  });

  it("throws (never silently no-ops) when CROP_CRED_ENC_KEY is absent", () => {
    expect(() => encryptCredential({ username: "u", password: "p" })).toThrow(/CROP_CRED_ENC_KEY/);
  });
});
