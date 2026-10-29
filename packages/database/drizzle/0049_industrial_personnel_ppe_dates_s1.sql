-- 0049_industrial_personnel_ppe_dates_s1
-- PPE allowance issue/expiration dates and manager approval for extra pairs.

ALTER TABLE "industrial_personnel"
  ADD COLUMN IF NOT EXISTS "prescription_safety_glasses_issued_date" date,
  ADD COLUMN IF NOT EXISTS "prescription_safety_glasses_expires_date" date,
  ADD COLUMN IF NOT EXISTS "prescription_safety_glasses_extra_pair_approved" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "prescription_safety_glasses_extra_pair_approved_by" varchar(300),
  ADD COLUMN IF NOT EXISTS "prescription_safety_glasses_extra_pair_approved_date" date,
  ADD COLUMN IF NOT EXISTS "prescription_safety_glasses_extra_pair_reason" text,
  ADD COLUMN IF NOT EXISTS "safety_footwear_issued_date" date,
  ADD COLUMN IF NOT EXISTS "safety_footwear_expires_date" date,
  ADD COLUMN IF NOT EXISTS "safety_footwear_extra_pair_approved" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "safety_footwear_extra_pair_approved_by" varchar(300),
  ADD COLUMN IF NOT EXISTS "safety_footwear_extra_pair_approved_date" date,
  ADD COLUMN IF NOT EXISTS "safety_footwear_extra_pair_reason" text;
