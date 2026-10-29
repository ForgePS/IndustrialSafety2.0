-- 0045_industrial_personnel_medical_emergency_s1
-- Medical and dual emergency-contact fields for the Add Person form.

ALTER TABLE "industrial_personnel"
  ADD COLUMN IF NOT EXISTS "allergies" text,
  ADD COLUMN IF NOT EXISTS "medical_history" text,
  ADD COLUMN IF NOT EXISTS "emergency_contact_1_name" varchar(300),
  ADD COLUMN IF NOT EXISTS "emergency_contact_1_phone" varchar(40),
  ADD COLUMN IF NOT EXISTS "emergency_contact_1_relationship" varchar(120),
  ADD COLUMN IF NOT EXISTS "emergency_contact_2_name" varchar(300),
  ADD COLUMN IF NOT EXISTS "emergency_contact_2_phone" varchar(40),
  ADD COLUMN IF NOT EXISTS "emergency_contact_2_relationship" varchar(120);
