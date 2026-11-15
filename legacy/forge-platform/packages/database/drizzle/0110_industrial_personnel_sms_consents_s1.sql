-- 0110_industrial_personnel_sms_consents_s1
-- Signed Emergency Alerts SMS consent records kept on each personnel file
-- (QR self-service signup and admin authorizations). Append-only proof of opt-in.

CREATE TABLE IF NOT EXISTS "industrial_personnel_sms_consents" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "personnel_id" uuid NOT NULL REFERENCES "industrial_personnel"("id"),
  "action" varchar(16) NOT NULL,
  "method" varchar(32) NOT NULL,
  "phone_number" varchar(40),
  "previous_phone_number" varchar(40),
  "consent_text" text,
  "consent_version" varchar(32),
  "signature_name" varchar(300),
  "employee_number" varchar(120),
  "qr_link_id" uuid REFERENCES "qr_links"("id"),
  "actor_user_id" uuid REFERENCES "users"("id"),
  "ip_address" varchar(64),
  "user_agent" varchar(500),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "industrial_personnel_sms_consents_action_chk" CHECK ("action" IN ('AUTHORIZED', 'REVOKED')),
  CONSTRAINT "industrial_personnel_sms_consents_method_chk" CHECK ("method" IN ('QR_SELF_SERVICE', 'ADMIN'))
);

CREATE INDEX IF NOT EXISTS "industrial_personnel_sms_consents_person_idx"
  ON "industrial_personnel_sms_consents" ("tenant_id", "personnel_id", "created_at");

GRANT SELECT, INSERT ON "industrial_personnel_sms_consents" TO forge_app;
ALTER TABLE "industrial_personnel_sms_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_personnel_sms_consents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_personnel_sms_consents_tenant_isolation"
  ON "industrial_personnel_sms_consents";
CREATE POLICY "industrial_personnel_sms_consents_tenant_isolation"
  ON "industrial_personnel_sms_consents"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
