# Storage / Branding (MK-S14)

## Branding fields (`tenant_branding`)

| Field                                                                    | Purpose                             |
| ------------------------------------------------------------------------ | ----------------------------------- |
| `display_name` / `short_name`                                            | Product / app names                 |
| `logo_document_id` / `icon_document_id`                                  | Tenant-owned `forge_documents` refs |
| colors + `approved_colors_json`                                          | Theme and approved palette          |
| `contact_name` / `contact_phone` / `support_email` / `email_sender_name` | Contact                             |
| `report_identity`                                                        | Report header identity              |
| `document_footer`                                                        | Document footer text                |

## Tenant-scoped storage

- Object keys: `tenants/{tenantId}/branding/{logo\|icon}/{storedFilename}`
- Upload: `POST /api/v1/tenants/:tenantId/branding/assets/upload-url`
- Download: `GET /api/v1/tenants/:tenantId/branding/assets/:documentId/download-url`
- PUT branding rejects document IDs that are missing or owned by another tenant
- Signed URLs expire in 900 seconds; expired access is rejected by `assertDownloadNotExpired`

## Permissions

`platform.configuration.update` **or** `tenant.configuration.update`

## Migration

`packages/database/drizzle/0033_mk_s14_branding_storage.sql` — **not applied to production** in this sprint.

## Tests

- Cross-tenant object key / document ownership unit guards
- Expired signed access helper
- Document storage branding key + assertTenantObjectKey
