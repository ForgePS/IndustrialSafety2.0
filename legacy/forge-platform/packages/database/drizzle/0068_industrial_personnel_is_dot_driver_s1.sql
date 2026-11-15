-- Split company-driver roster flag from DOT driver qualification tracking.
-- 0068 originally backfilled is_dot_driver from is_company_driver; 0069 corrects
-- that so only people with a Drivers (DQF) file are DOT drivers.

ALTER TABLE "industrial_personnel"
  ADD COLUMN IF NOT EXISTS "is_dot_driver" boolean NOT NULL DEFAULT false;

UPDATE "industrial_personnel"
SET "is_dot_driver" = "is_company_driver"
WHERE "is_company_driver" = true;
