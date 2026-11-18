# Data architecture (infra baseline)

- Aurora PostgreSQL Serverless v2, DB name `forge_platform`
- Engine target: 15.x (confirm GovCloud parity before lock-in)
- Credentials: Secrets Manager (auto-generated); not in outputs
- S3: documents, imports, exports, audit-archive, application-assets
- Object key conventions (app layer): `tenants/{tenantId}/...`
- Schema modeling begins Sprint 1D — not created here
