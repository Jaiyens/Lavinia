import { randomInt } from "node:crypto";

// The emailed sign-in CODE (not a magic link). Pulled out of lib/auth.ts so the generator is
// unit-testable without importing NextAuth (which instantiates the whole Auth.js config at
// module load). lib/auth.ts hands this to the email provider's `generateVerificationToken`.

/** Number of digits in a sign-in code. Six is the phone-typable sweet spot; the short 10-min
 *  expiry + the per-email verify budget (lib/auth/login-rate-limit.ts) cover the low entropy. */
export const LOGIN_CODE_LENGTH = 6;

/**
 * A cryptographically-uniform 6-digit code, zero-padded ("000000"-"999999"). `randomInt` is
 * rejection-sampled, so every value in the range is equally likely (no modulo bias that would
 * shrink the effective keyspace a guesser must cover). Returned as a string so a leading-zero
 * code is never silently truncated to fewer digits.
 */
export function generateLoginCode(): string {
  return randomInt(0, 10 ** LOGIN_CODE_LENGTH).toString().padStart(LOGIN_CODE_LENGTH, "0");
}

/** True for a well-formed code: exactly `LOGIN_CODE_LENGTH` ASCII digits, nothing else. */
export function isLoginCodeFormat(value: string): boolean {
  return new RegExp(`^[0-9]{${LOGIN_CODE_LENGTH}}$`).test(value);
}
