-- Least-privilege defaults. FarmMembership.role and FarmInvite.role previously defaulted to
-- 'manager'; switch both to 'viewer' so a future create that forgets to set role explicitly grants
-- the SAFEST role, never silent manager access. (FarmJoinRequest.proposedRole already defaults to
-- 'viewer'.) Every current code path sets role explicitly, so this only changes the safety-net
-- default for new rows; it does NOT touch any existing row's role. Hand-authored on purpose:
-- `prisma migrate diff` is blind to this app's partial unique indexes and would drop them, so this
-- migration deliberately contains ONLY the two ALTER ... SET DEFAULT statements.

ALTER TABLE "FarmMembership" ALTER COLUMN "role" SET DEFAULT 'viewer';
ALTER TABLE "FarmInvite" ALTER COLUMN "role" SET DEFAULT 'viewer';
