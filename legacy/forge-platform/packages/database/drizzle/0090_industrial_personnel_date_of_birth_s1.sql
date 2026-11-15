-- 0090_industrial_personnel_date_of_birth_s1
-- Date of birth on Employee Profiles for Incidents / Workers' Comp seeding.

ALTER TABLE "industrial_personnel"
  ADD COLUMN IF NOT EXISTS "date_of_birth" date;
