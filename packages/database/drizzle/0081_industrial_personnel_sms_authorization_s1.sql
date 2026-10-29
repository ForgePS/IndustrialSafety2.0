-- 0081_industrial_personnel_sms_authorization_s1
-- Explicit SMS opt-in for Emergency Alerts (10DLC digital form on personnel file).
-- SMS Notification number is the personnel phone column (not a separate number).

ALTER TABLE "industrial_personnel"
  ADD COLUMN IF NOT EXISTS "sms_authorized_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "sms_authorized_by_user_id" uuid
    REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "sms_opted_out_at" timestamptz;

CREATE INDEX IF NOT EXISTS "industrial_personnel_tenant_sms_auth_idx"
  ON "industrial_personnel" ("tenant_id", "sms_authorized_at");
