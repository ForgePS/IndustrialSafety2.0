-- 0044_industrial_personnel_company_contact_s1
-- Company contact fields for the Add Person Contact section
-- (company phone / company email alongside personal email / phone).

ALTER TABLE "industrial_personnel"
  ADD COLUMN IF NOT EXISTS "company_phone" varchar(40),
  ADD COLUMN IF NOT EXISTS "company_email" varchar(320);
