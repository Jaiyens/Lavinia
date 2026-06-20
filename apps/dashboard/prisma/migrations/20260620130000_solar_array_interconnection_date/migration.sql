-- DM1 (F-1, FR16): the array's Permission-to-Operate / interconnection date. Additive-nullable, so
-- it is a safe, non-breaking change: existing SolarArray rows get NULL (honest-unknown), and the
-- 20-year-from-PTO grandfather countdown renders ONLY where a date is on file. Never estimated.
-- Safe to run with `prisma migrate deploy`.
ALTER TABLE "SolarArray" ADD COLUMN "interconnectionDate" TIMESTAMP(3);
