-- Platform presence: recent API activity for online indicators (e.g. Messaging).
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "last_activity_at" timestamptz;

CREATE INDEX IF NOT EXISTS "users_last_activity_at_idx"
  ON "users" ("last_activity_at");
