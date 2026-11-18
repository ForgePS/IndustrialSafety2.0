-- 0113_industrial_training_group_presented_s1
-- Training assignments can be delivered as a group presentation: an instructor shows the
-- course content (videos) to the whole group, then each assignee takes the quiz on their own.
-- GROUP_PRESENTED assignments let assignees start the quiz without completing course sections.

ALTER TABLE "industrial_training_assignments"
  ADD COLUMN IF NOT EXISTS "content_delivery" varchar(32) NOT NULL DEFAULT 'SELF_PACED';

ALTER TABLE "industrial_training_assignments"
  DROP CONSTRAINT IF EXISTS "industrial_training_assignments_content_delivery_check";

ALTER TABLE "industrial_training_assignments"
  ADD CONSTRAINT "industrial_training_assignments_content_delivery_check"
  CHECK ("content_delivery" IN ('SELF_PACED', 'GROUP_PRESENTED'));

ALTER TABLE "industrial_training_assignments"
  ADD COLUMN IF NOT EXISTS "content_presented_at" timestamptz;
