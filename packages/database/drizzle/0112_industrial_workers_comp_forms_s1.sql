-- 0112_industrial_workers_comp_forms_s1
-- Producers paper forms on workers' compensation cases: Employee Injury Guidelines acknowledgment
-- and HIPAA Authorization. Each row is one signed form; signed content is immutable (corrections
-- are made by voiding with a reason and signing a new form). HIPAA rows hold protected health
-- information, so RLS also requires the per-transaction medical-access flag that the WC medical
-- tables use (app.industrial_wc_medical_access = 'on').

CREATE TABLE IF NOT EXISTS "industrial_workers_comp_forms" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "case_id" uuid NOT NULL REFERENCES "industrial_workers_comp_cases"("id") ON DELETE CASCADE,
  "form_key" varchar(64) NOT NULL
    CHECK ("form_key" IN ('INJURY_GUIDELINES_ACK', 'HIPAA_AUTHORIZATION')),
  "status" varchar(16) NOT NULL DEFAULT 'SIGNED'
    CHECK ("status" IN ('SIGNED', 'VOIDED')),
  "form_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "signature_data_url" text NOT NULL,
  "signer_name" varchar(200) NOT NULL,
  "signer_relationship" varchar(120),
  "signed_at" timestamptz NOT NULL DEFAULT now(),
  "created_by_user_id" uuid,
  "voided_at" timestamptz,
  "voided_by_user_id" uuid,
  "void_reason" text,
  "email_log" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "industrial_wc_forms_void_reason" CHECK (
    "status" <> 'VOIDED' OR ("voided_at" IS NOT NULL AND length(btrim(coalesce("void_reason", ''))) > 0)
  )
);
CREATE INDEX IF NOT EXISTS "industrial_wc_forms_case_idx"
  ON "industrial_workers_comp_forms" ("tenant_id", "case_id", "form_key");

GRANT SELECT, INSERT, UPDATE ON "industrial_workers_comp_forms" TO forge_app;
-- Default privileges grant DELETE on new tables to forge_app; signed forms are never hard-deleted.
REVOKE DELETE, TRUNCATE ON "industrial_workers_comp_forms" FROM forge_app;
ALTER TABLE "industrial_workers_comp_forms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_workers_comp_forms" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_workers_comp_forms_tenant_restricted" ON "industrial_workers_comp_forms";
CREATE POLICY "industrial_workers_comp_forms_tenant_restricted" ON "industrial_workers_comp_forms"
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    AND (
      form_key <> 'HIPAA_AUTHORIZATION'
      OR current_setting('app.industrial_wc_medical_access', true) = 'on'
    )
  )
  WITH CHECK (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    AND (
      form_key <> 'HIPAA_AUTHORIZATION'
      OR current_setting('app.industrial_wc_medical_access', true) = 'on'
    )
  );

-- Signed content never changes. Allowed updates: SIGNED -> VOIDED (with reason) and appending to email_log.
CREATE OR REPLACE FUNCTION "industrial_workers_comp_forms_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id"
     OR NEW."case_id" IS DISTINCT FROM OLD."case_id"
     OR NEW."form_key" IS DISTINCT FROM OLD."form_key"
     OR NEW."form_data" IS DISTINCT FROM OLD."form_data"
     OR NEW."signature_data_url" IS DISTINCT FROM OLD."signature_data_url"
     OR NEW."signer_name" IS DISTINCT FROM OLD."signer_name"
     OR NEW."signer_relationship" IS DISTINCT FROM OLD."signer_relationship"
     OR NEW."signed_at" IS DISTINCT FROM OLD."signed_at"
     OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Signed workers'' comp forms cannot be changed; void the form and sign a new one'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" = 'VOIDED' AND (
       NEW."status" IS DISTINCT FROM OLD."status"
       OR NEW."voided_at" IS DISTINCT FROM OLD."voided_at"
       OR NEW."voided_by_user_id" IS DISTINCT FROM OLD."voided_by_user_id"
       OR NEW."void_reason" IS DISTINCT FROM OLD."void_reason") THEN
    RAISE EXCEPTION 'A voided workers'' comp form cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  -- email_log may only grow: the old entries must be an exact prefix of the new array.
  IF jsonb_typeof(NEW."email_log") <> 'array'
     OR jsonb_array_length(NEW."email_log") < jsonb_array_length(OLD."email_log")
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(OLD."email_log") WITH ORDINALITY AS prev(entry, position)
       WHERE NEW."email_log" -> (prev.position::int - 1) IS DISTINCT FROM prev.entry
     ) THEN
    RAISE EXCEPTION 'Form email history is append-only' USING ERRCODE = 'check_violation';
  END IF;
  NEW."updated_at" := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "industrial_workers_comp_forms_guard" ON "industrial_workers_comp_forms";
CREATE TRIGGER "industrial_workers_comp_forms_guard"
  BEFORE UPDATE ON "industrial_workers_comp_forms"
  FOR EACH ROW EXECUTE FUNCTION "industrial_workers_comp_forms_guard"();
