-- Phase 3 specialty review: comment assignment + section return status support.

ALTER TABLE "neris_incident_review_comments"
  ADD COLUMN IF NOT EXISTS "assigned_to_user_id" uuid;

CREATE INDEX IF NOT EXISTS "neris_incident_review_comments_assigned_idx"
  ON "neris_incident_review_comments" ("assigned_to_user_id")
  WHERE "assigned_to_user_id" IS NOT NULL;
