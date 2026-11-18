-- 0059_industrial_training_assignment_qr_s1
-- Public QR links for training assignments. Learners verify with employee number at scan time.
-- forge_app is subject to FORCE RLS, so tenant lookup uses a narrow SECURITY DEFINER helper.

ALTER TABLE "industrial_training_assignments"
  ADD COLUMN IF NOT EXISTS "public_token_hash" varchar(128),
  ADD COLUMN IF NOT EXISTS "public_token_issued_at" timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS "industrial_training_assignments_public_token_uidx"
  ON "industrial_training_assignments" ("public_token_hash")
  WHERE "public_token_hash" IS NOT NULL;

CREATE OR REPLACE FUNCTION forge_industrial_training_tenant_for_token(p_token_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF p_token_hash IS NULL OR length(p_token_hash) < 32 THEN
    RETURN NULL;
  END IF;
  SELECT tenant_id
    INTO v_tenant_id
  FROM industrial_training_assignments
  WHERE public_token_hash = p_token_hash
    AND archived_at IS NULL
    AND status = 'ACTIVE'
  LIMIT 1;
  RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION forge_industrial_training_tenant_for_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION forge_industrial_training_tenant_for_token(text) TO forge_app;

ALTER TABLE "industrial_training_attempts"
  ADD COLUMN IF NOT EXISTS "employee_number" varchar(120);

ALTER TABLE "industrial_training_attempts"
  ALTER COLUMN "user_id" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "industrial_training_attempts_employee_idx"
  ON "industrial_training_attempts" ("tenant_id", "employee_number");
