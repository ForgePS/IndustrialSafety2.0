-- 0106_forge_photo_markup_permissions_s1
-- Seed industrial.photo_markup.* permissions and grant to industrial.admin roles/templates.

INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT gen_random_uuid(), v.code, v.name, v.description, 'TENANT', v.risk_level, v.is_sensitive, now(), now()
FROM (VALUES
  ('industrial.photo_markup.view', 'View photo markup', 'View marked-up photos and annotation overlays', 'NORMAL', false),
  ('industrial.photo_markup.create', 'Create photo markup', 'Create markup on photos', 'NORMAL', false),
  ('industrial.photo_markup.edit', 'Edit photo markup', 'Edit existing photo markup revisions', 'NORMAL', false),
  ('industrial.photo_markup.delete', 'Delete photo markup', 'Delete photo markup revisions', 'ELEVATED', false),
  ('industrial.photo_markup.view_original', 'View original photos', 'View original unedited photo files', 'NORMAL', false),
  ('industrial.photo_markup.view_history', 'View markup history', 'View photo markup revision history', 'NORMAL', false),
  ('industrial.photo_markup.restore', 'Restore markup revision', 'Restore a prior markup revision as a new revision', 'ELEVATED', false),
  ('industrial.photo_markup.redact', 'Redact photos', 'Apply blur and redaction markup', 'ELEVATED', true)
) AS v(code, name, description, risk_level, is_sensitive)
WHERE NOT EXISTS (SELECT 1 FROM "permissions" p WHERE p.code = v.code);

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", p."id"
FROM "role_permissions" rp
JOIN "permissions" admin_p ON admin_p."id" = rp."permission_id" AND admin_p."code" = 'industrial.admin'
JOIN "permissions" p ON p."code" IN (
  'industrial.photo_markup.view',
  'industrial.photo_markup.create',
  'industrial.photo_markup.edit',
  'industrial.photo_markup.delete',
  'industrial.photo_markup.view_original',
  'industrial.photo_markup.view_history',
  'industrial.photo_markup.restore',
  'industrial.photo_markup.redact'
)
WHERE NOT EXISTS (
  SELECT 1 FROM "role_permissions" existing
  WHERE existing."role_id" = rp."role_id" AND existing."permission_id" = p."id"
);

INSERT INTO "role_template_permissions" ("role_template_id", "permission_id")
SELECT DISTINCT rtp."role_template_id", p."id"
FROM "role_template_permissions" rtp
JOIN "permissions" admin_p ON admin_p."id" = rtp."permission_id" AND admin_p."code" = 'industrial.admin'
JOIN "permissions" p ON p."code" IN (
  'industrial.photo_markup.view',
  'industrial.photo_markup.create',
  'industrial.photo_markup.edit',
  'industrial.photo_markup.delete',
  'industrial.photo_markup.view_original',
  'industrial.photo_markup.view_history',
  'industrial.photo_markup.restore',
  'industrial.photo_markup.redact'
)
WHERE NOT EXISTS (
  SELECT 1 FROM "role_template_permissions" existing
  WHERE existing."role_template_id" = rtp."role_template_id" AND existing."permission_id" = p."id"
);

-- Practical grants: roles that manage inspections/incidents can create/view markup
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", p."id"
FROM "role_permissions" rp
JOIN "permissions" gate ON gate."id" = rp."permission_id"
  AND gate."code" IN ('industrial.inspections.manage', 'industrial.incidents.manage', 'industrial.sanitation.manage')
JOIN "permissions" p ON p."code" IN (
  'industrial.photo_markup.view',
  'industrial.photo_markup.create',
  'industrial.photo_markup.edit',
  'industrial.photo_markup.view_original',
  'industrial.photo_markup.view_history'
)
WHERE NOT EXISTS (
  SELECT 1 FROM "role_permissions" existing
  WHERE existing."role_id" = rp."role_id" AND existing."permission_id" = p."id"
);
