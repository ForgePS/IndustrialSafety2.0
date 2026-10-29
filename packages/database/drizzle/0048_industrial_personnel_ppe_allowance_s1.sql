-- 0048_industrial_personnel_ppe_allowance_s1
-- Prescription safety glasses and safety footwear allowance tracking.

ALTER TABLE "industrial_personnel"
  ADD COLUMN IF NOT EXISTS "tracks_prescription_safety_glasses" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "safety_footwear_class" varchar(32);
