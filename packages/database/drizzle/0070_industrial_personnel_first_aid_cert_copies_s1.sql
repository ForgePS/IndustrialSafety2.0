-- 0070_industrial_personnel_first_aid_cert_copies_s1
-- Store uploaded CPR / First Aid certification copies as forge_documents
-- (binary S3 upload), not JSON/data-URL payloads on the personnel row.

ALTER TABLE "industrial_personnel"
  ADD COLUMN IF NOT EXISTS "cpr_certification_document_id" uuid
    REFERENCES "forge_documents"("id"),
  ADD COLUMN IF NOT EXISTS "first_aid_certification_document_id" uuid
    REFERENCES "forge_documents"("id");
