-- 0043_industrial_personnel_add_person_template_s1
-- Expand industrial_personnel to support the full Add Person form template
-- (legacy Firebase personnelRecords parity for identity, assignment, driver, notes, signature).

ALTER TABLE "industrial_personnel"
  ADD COLUMN IF NOT EXISTS "middle_name" varchar(150),
  ADD COLUMN IF NOT EXISTS "suffix" varchar(32),
  ADD COLUMN IF NOT EXISTS "preferred_name" varchar(150),
  ADD COLUMN IF NOT EXISTS "job_title" varchar(300),
  ADD COLUMN IF NOT EXISTS "department_name" varchar(300),
  ADD COLUMN IF NOT EXISTS "file_base" varchar(300),
  ADD COLUMN IF NOT EXISTS "company_name" varchar(300),
  ADD COLUMN IF NOT EXISTS "division_name" varchar(300),
  ADD COLUMN IF NOT EXISTS "user_auth_id" varchar(320),
  ADD COLUMN IF NOT EXISTS "digital_source" varchar(200),
  ADD COLUMN IF NOT EXISTS "is_company_driver" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "notes" text,
  ADD COLUMN IF NOT EXISTS "signature_url" text;
