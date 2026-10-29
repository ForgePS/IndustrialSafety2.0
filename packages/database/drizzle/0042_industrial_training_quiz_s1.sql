-- INDUSTRIAL TRAINING QUIZ S1: FiredUp-style sources/chapters/questions/quizzes/attempts.
-- Additive. Preserves industrial_training_records (migrated completions). Tenant RLS.

CREATE TABLE IF NOT EXISTS "industrial_training_sources" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "title" varchar(500) NOT NULL,
  "edition" varchar(120),
  "description" text,
  "status" varchar(64) NOT NULL DEFAULT 'DRAFT',
  "chapter_count" integer NOT NULL DEFAULT 0,
  "question_count" integer NOT NULL DEFAULT 0,
  "created_by_user_id" uuid,
  "published_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_training_sources_tenant_status_idx"
  ON "industrial_training_sources" ("tenant_id", "status");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_sources" TO forge_app;
ALTER TABLE "industrial_training_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_sources" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_sources_tenant_isolation" ON "industrial_training_sources";
CREATE POLICY "industrial_training_sources_tenant_isolation" ON "industrial_training_sources"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_training_chapters" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "source_id" uuid NOT NULL REFERENCES "industrial_training_sources"("id") ON DELETE CASCADE,
  "title" varchar(500) NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "page_range" varchar(120),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_training_chapters_source_idx"
  ON "industrial_training_chapters" ("tenant_id", "source_id", "sort_order");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_chapters" TO forge_app;
ALTER TABLE "industrial_training_chapters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_chapters" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_chapters_tenant_isolation" ON "industrial_training_chapters";
CREATE POLICY "industrial_training_chapters_tenant_isolation" ON "industrial_training_chapters"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_training_questions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "source_id" uuid NOT NULL REFERENCES "industrial_training_sources"("id") ON DELETE CASCADE,
  "chapter_id" uuid NOT NULL REFERENCES "industrial_training_chapters"("id") ON DELETE CASCADE,
  "stem" text NOT NULL,
  "choices" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "correct_index" integer NOT NULL DEFAULT 0,
  "explanation" text,
  "page_ref" varchar(120),
  "difficulty" varchar(32) DEFAULT 'MEDIUM',
  "status" varchar(64) NOT NULL DEFAULT 'DRAFT',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_training_questions_chapter_idx"
  ON "industrial_training_questions" ("tenant_id", "chapter_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_training_questions_source_idx"
  ON "industrial_training_questions" ("tenant_id", "source_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_questions" TO forge_app;
ALTER TABLE "industrial_training_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_questions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_questions_tenant_isolation" ON "industrial_training_questions";
CREATE POLICY "industrial_training_questions_tenant_isolation" ON "industrial_training_questions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_training_quizzes" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "source_id" uuid NOT NULL REFERENCES "industrial_training_sources"("id"),
  "created_by_user_id" uuid,
  "mode" varchar(32) NOT NULL DEFAULT 'STANDARD',
  "option_count" integer NOT NULL DEFAULT 4,
  "feedback_enabled" boolean NOT NULL DEFAULT true,
  "timer_seconds" integer,
  "chapter_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_training_quizzes_tenant_idx"
  ON "industrial_training_quizzes" ("tenant_id", "created_at");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_quizzes" TO forge_app;
ALTER TABLE "industrial_training_quizzes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_quizzes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_quizzes_tenant_isolation" ON "industrial_training_quizzes";
CREATE POLICY "industrial_training_quizzes_tenant_isolation" ON "industrial_training_quizzes"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_training_attempts" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "quiz_id" uuid NOT NULL REFERENCES "industrial_training_quizzes"("id"),
  "user_id" uuid NOT NULL,
  "source_id" uuid NOT NULL REFERENCES "industrial_training_sources"("id"),
  "status" varchar(64) NOT NULL DEFAULT 'IN_PROGRESS',
  "question_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "answers" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "bookmarks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "current_index" integer NOT NULL DEFAULT 0,
  "score_correct" integer NOT NULL DEFAULT 0,
  "score_total" integer NOT NULL DEFAULT 0,
  "mastery_state" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "resumed_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_training_attempts_user_idx"
  ON "industrial_training_attempts" ("tenant_id", "user_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_training_attempts_quiz_idx"
  ON "industrial_training_attempts" ("tenant_id", "quiz_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_attempts" TO forge_app;
ALTER TABLE "industrial_training_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_attempts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_attempts_tenant_isolation" ON "industrial_training_attempts";
CREATE POLICY "industrial_training_attempts_tenant_isolation" ON "industrial_training_attempts"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_training_user_stats" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL,
  "source_id" uuid NOT NULL REFERENCES "industrial_training_sources"("id") ON DELETE CASCADE,
  "chapter_id" uuid REFERENCES "industrial_training_chapters"("id") ON DELETE CASCADE,
  "seen_count" integer NOT NULL DEFAULT 0,
  "correct_count" integer NOT NULL DEFAULT 0,
  "mastered_count" integer NOT NULL DEFAULT 0,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "avg_score" numeric(5, 2),
  "last_attempt_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_training_user_stats_source_uidx"
  ON "industrial_training_user_stats" ("tenant_id", "user_id", "source_id")
  WHERE "chapter_id" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_training_user_stats_chapter_uidx"
  ON "industrial_training_user_stats" ("tenant_id", "user_id", "source_id", "chapter_id")
  WHERE "chapter_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "industrial_training_user_stats_user_idx"
  ON "industrial_training_user_stats" ("tenant_id", "user_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_user_stats" TO forge_app;
ALTER TABLE "industrial_training_user_stats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_user_stats" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_user_stats_tenant_isolation" ON "industrial_training_user_stats";
CREATE POLICY "industrial_training_user_stats_tenant_isolation" ON "industrial_training_user_stats"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
