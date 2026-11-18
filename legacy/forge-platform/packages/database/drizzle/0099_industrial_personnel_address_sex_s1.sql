-- 0099_industrial_personnel_address_sex_s1
-- Home address and sex on Employee Profiles for Workers' Comp / OSHA Form 301 seeding.

ALTER TABLE "industrial_personnel"
  ADD COLUMN IF NOT EXISTS "street" varchar(300),
  ADD COLUMN IF NOT EXISTS "city" varchar(120),
  ADD COLUMN IF NOT EXISTS "state" varchar(64),
  ADD COLUMN IF NOT EXISTS "zip" varchar(32),
  ADD COLUMN IF NOT EXISTS "gender" varchar(32);
