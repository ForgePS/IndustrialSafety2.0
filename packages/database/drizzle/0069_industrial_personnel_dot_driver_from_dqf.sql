-- Correct 0068 backfill: DOT Driver is not "all company drivers".
-- A person is a DOT driver only when linked to a real Drivers (DQF) file.
-- Mis-seeded company-driver roster rows in DOT are excluded.

UPDATE "industrial_personnel" AS p
SET "is_dot_driver" = EXISTS (
  SELECT 1
  FROM "industrial_dot_compliance_records" AS d
  WHERE d."tenant_id" = p."tenant_id"
    AND d."personnel_id" = p."id"
    AND d."archived_at" IS NULL
    AND NOT (
      lower(coalesce(d."source_collection", '')) IN (
        'companyvehicledrivers',
        'personneldriverqualification'
      )
      OR lower(coalesce(d."source_path", '')) LIKE '%companyvehicledrivers%'
      OR lower(coalesce(d."source_payload"->>'seededFrom', '')) LIKE '%industrial_fleet_drivers%'
      OR lower(coalesce(d."source_payload"->>'seededFrom', '')) LIKE '%is_company_driver%'
    )
    AND (
      coalesce(d."source_path", '') ~* 'drivers/DRV-'
      OR coalesce(d."source_document_id", '') ~* 'DRV-'
      OR coalesce(d."title", '') ~* 'DRV-'
      OR lower(coalesce(d."source_collection", '')) LIKE '%dqf%'
      OR lower(coalesce(d."source_payload"->>'category', '')) LIKE '%dqf%'
      OR (d."source_payload"->>'dqf') IN ('true', 'True', '1')
      OR coalesce(d."source_payload"::text, '') ~* 'DRV-[0-9]{4}-[0-9]+'
      OR (
        lower(coalesce(d."source_payload"->>'category', '')) LIKE '%driver%'
        AND lower(coalesce(d."source_collection", '')) NOT LIKE '%fleet%'
      )
    )
);

-- Producers: every DOT driver is also a company driver (roster + MVR track).
UPDATE "industrial_personnel" AS p
SET "is_company_driver" = true
FROM "tenants" AS t
WHERE p."tenant_id" = t."id"
  AND t."tenant_key" = 'producers-rice-mill'
  AND p."is_dot_driver" = true
  AND p."is_company_driver" = false;
