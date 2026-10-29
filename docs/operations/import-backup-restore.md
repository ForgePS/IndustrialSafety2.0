# Import Platform — Backup and Restore (S8)

**Document:** `docs/operations/import-backup-restore.md`  
**Audience:** Platform ops / SRE  
**Environment context:** development AWS `511343547817` / `us-east-1` (patterns apply to named envs)

## Scope

Import-specific backup and restore for:

| Layer             | What is protected                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| Aurora PostgreSQL | Job metadata, rows, journals, mappings, scan events, security artifacts (FORCE RLS tables through migration `0027`) |
| S3 imports bucket | Uploaded objects and generated artifacts (SSE-KMS, versioning enabled)                                              |
| Queue             | Transient only — SQS is **not** a durable backup; DLQ retention is operational hold, not archive                    |

This runbook does **not** cover product destination data written by future adapters (none ship in S8).

## Current posture (inspected / documented)

| Control                                | Status                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Aurora continuous backup / PITR        | Platform Aurora cluster covered by `ForgeBackups` / backup plan (e.g. `forge-development-backup-daily`) |
| Imports S3 versioning                  | **Enabled** on `forge-*-imports-*-us-east-1`                                                            |
| Imports bucket in AWS Backup selection | **Not** selected in CDK `ForgeBackups` — rely on versioning + lifecycle + DB metadata                   |
| Lifecycle                              | `retention.importFilesDays` (developer profile: **14 days**); incomplete MPU abort ~3 days              |
| Cross-region DR                        | **Not claimed** — no tested cross-region restore evidence for import workloads                          |

## RPO / RTO (placeholders — fill after controlled restore test)

| Objective             | Target (placeholder)                                                                            | Evidence status         |
| --------------------- | ----------------------------------------------------------------------------------------------- | ----------------------- |
| RPO (Aurora metadata) | _TBD after PITR drill_ — typically bounded by Aurora continuous backup granularity              | PENDING_CONTROLLED_TEST |
| RTO (Aurora metadata) | _TBD_ — restore cluster/DB + re-point app secrets + smoke import APIs                           | PENDING_CONTROLLED_TEST |
| RPO (S3 objects)      | Versioning allows point-in-time object recovery within retention; lifecycle may expire versions | PENDING_CONTROLLED_TEST |
| RTO (S3 objects)      | _TBD_ — version restore or copy + job file pointer reconciliation                               | PENDING_CONTROLLED_TEST |
| Cross-region RPO/RTO  | **Do not publish** until a controlled cross-region restore is executed and documented           | NOT CLAIMED             |

Update this table only with measured results from a named drill; never invent timings.

## Aurora PITR procedure (outline)

1. Identify blast radius: tenant(s), jobId(s), time window (`correlationId` / `updated_at`).
2. Confirm continuous backup window covers the incident.
3. Restore to a **new** cluster or temporary instance (prefer non-destructive restore target).
4. Validate FORCE RLS still enforced; app role only — never restore with migration credentials in app path.
5. Extract or compare import tables as needed (`import_jobs`, `import_files`, `import_rows`, `import_execution_journal`, `import_file_scan_events`, …).
6. Reconcile with S3 object versions (checksum / content hash on `import_files`).
7. Document operator, ticket, PITR timestamp, and verification checklist.

**Do not** overwrite production Aurora in place without change control.

## S3 versioning restore (outline)

1. Locate object key from job file metadata (tenant-scoped path).
2. List object versions; select version prior to corruption/delete.
3. Restore via version copy or delete-marker removal per AWS S3 versioning practice.
4. Re-run HeadObject from API upload/complete semantics if job must resume.
5. If malware/quarantine tags existed, re-evaluate security state — do not auto-clear quarantine.

## Controlled restore test requirement

Before declaring import DR ready for any production-like enablement:

1. Schedule a **controlled restore test** in non-prod.
2. Exercise Aurora PITR to a scratch target **and** at least one S3 version restore for an import object.
3. Record measured RPO/RTO in this document.
4. Confirm job metadata ↔ object checksum consistency and RLS isolation smoke.
5. File evidence under `docs/testing/evidence/import-platform/` (or approved path).

Until that drill exists, backup posture is **configured but not proven** for import workloads.

## What backup does not fix

- Poison SQS / DLQ messages (use DLQ runbook).
- Stuck PROCESSING without lock expiry (worker / stuck-job runbooks).
- Reference scanner production block (Outcome B) — restore cannot enable imports in production-like envs.
- Full rollback compensation (classification only) — PITR may recover prior DB state; it is not product undo.

## Related

- Master index: `docs/operations/import-runbook.md`
- Storage: `docs/architecture/import-storage.md`
- Deployment: `docs/deployment/import-platform-s8-deployment.md`
