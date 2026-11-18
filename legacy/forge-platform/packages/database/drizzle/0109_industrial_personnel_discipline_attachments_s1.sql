-- 0109_industrial_personnel_discipline_attachments_s1
-- Signed write-ups / photos attached to disciplinary actions (forge_documents ids).

ALTER TABLE "industrial_personnel_disciplinary_actions"
  ADD COLUMN IF NOT EXISTS "attachments" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Points are fixed per action type and every action counts for 12 months.
UPDATE "industrial_personnel_disciplinary_actions"
SET
  "points" = CASE "action_type"
    WHEN 'COACHING' THEN 2
    WHEN 'VERBAL_WARNING' THEN 5
    WHEN 'WRITTEN_WARNING' THEN 10
    WHEN 'FINAL_WARNING' THEN 15
    WHEN 'SUSPENSION' THEN 20
    WHEN 'TERMINATION' THEN 25
    ELSE "points"
  END,
  "counts_until" = ("action_date" + interval '12 months')::date;
