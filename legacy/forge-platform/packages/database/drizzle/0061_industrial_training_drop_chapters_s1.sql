-- INDUSTRIAL TRAINING: remove chapter layer; questions belong to courses (sources) only.

ALTER TABLE "industrial_training_questions" DROP CONSTRAINT IF EXISTS "industrial_training_questions_chapter_id_industrial_training_chapters_id_fk";
DROP INDEX IF EXISTS "industrial_training_questions_chapter_idx";
ALTER TABLE "industrial_training_questions" DROP COLUMN IF EXISTS "chapter_id";

ALTER TABLE "industrial_training_user_stats" DROP CONSTRAINT IF EXISTS "industrial_training_user_stats_chapter_id_industrial_training_chapters_id_fk";
ALTER TABLE "industrial_training_user_stats" DROP COLUMN IF EXISTS "chapter_id";

ALTER TABLE "industrial_training_assignments" DROP COLUMN IF EXISTS "chapter_ids";
ALTER TABLE "industrial_training_quizzes" DROP COLUMN IF EXISTS "chapter_ids";

ALTER TABLE "industrial_training_sources" DROP COLUMN IF EXISTS "chapter_count";

DROP TABLE IF EXISTS "industrial_training_chapters";
