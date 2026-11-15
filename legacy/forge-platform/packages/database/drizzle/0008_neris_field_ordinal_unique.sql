-- Fix unique key for fields that repeat within a module (same key, different ordinal).
DROP INDEX IF EXISTS "neris_fields_version_module_key_uidx";
CREATE UNIQUE INDEX IF NOT EXISTS "neris_fields_version_module_key_ord_uidx"
  ON "neris_fields" ("schema_version_id", "module_id", "field_key", "ordinal");
