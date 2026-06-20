// One canonical form for an email address. The whole multi-tenant identity model rests on
// "a verified email IS the person", so the same human must never split across two User rows
// (nor an invite get matched to the wrong identity) merely because of letter case or Unicode
// form. We trim, NFKC-normalize, and lowercase the WHOLE address.
//
// We deliberately do NOT strip plus-tags or dots: `a+ops@farm.com` and `a@farm.com` are kept
// DISTINCT. That errs toward ISOLATION (two addresses stay two identities) rather than toward
// merging, which is the safe direction for an access-control key.
//
// Apply at EVERY boundary that stores or looks up an email: the login action, the Auth.js
// adapter (createUser / getUserByEmail / updateUser), Person.email writes, and (later phases)
// the invite-claim lookup and the allowlist check. One stored form means two casings can never
// become two users or strand an invite.
export function normalizeEmail(raw: string): string {
  return raw.trim().normalize("NFKC").toLowerCase();
}
