-- 0053_industrial_personnel_first_aid_s1
-- CPR and First Aid certification expiration tracking on personnel files.

ALTER TABLE "industrial_personnel"
  ADD COLUMN IF NOT EXISTS "tracks_first_aid" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "cpr_certification_expires_date" date,
  ADD COLUMN IF NOT EXISTS "first_aid_certification_expires_date" date;
