-- FORGE-SAAS MK-S21: strip self-serve entitlement.manage from tenant owner/admin.
-- Not applied to production in this sprint. Creator roles retain platform.entitlement.manage.

DELETE FROM "role_template_permissions" rtp
USING "role_templates" rt, "permissions" p
WHERE rtp.role_template_id = rt.id
  AND rtp.permission_id = p.id
  AND rt.code IN ('TENANT_OWNER', 'TENANT_ADMIN')
  AND p.code = 'platform.entitlement.manage';

DELETE FROM "role_permissions" rp
USING "roles" r, "permissions" p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code IN ('TENANT_OWNER', 'TENANT_ADMIN')
  AND p.code = 'platform.entitlement.manage';
