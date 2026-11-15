# Production database backup and restore

**Environment:** production (`Forge-Production-Data` / `Forge-Production-Backup`)  
**Account:** 511343547817 · **Region:** us-east-1

## Policy

| Control                  | Value                                          |
| ------------------------ | ---------------------------------------------- |
| Aurora automated backups | Production profile retention (35 days)         |
| PITR                     | Continuous within Aurora backup window         |
| AWS Backup plan          | Daily rule (stack Backup); vault CMK-encrypted |
| Deletion protection      | Required on production cluster                 |
| Encryption               | Storage + backup CMKs from Security stack      |

## Manual snapshot (pre-migrate / pre-PROD-S1)

```bash
aws rds create-db-cluster-snapshot \
  --db-cluster-identifier forge-production-rds-aurora \
  --db-cluster-snapshot-identifier forge-production-pre-migrate-$(date +%Y%m%d%H%M)
```

Wait until `Status=available` before applying migrations.

## Restore procedure (no customer improvisation)

1. Identify snapshot / PITR timestamp (`ROLLBACK_TARGET`).
2. Restore to a **new** cluster name: `forge-production-rds-aurora-restore-YYYYMMDD`.
3. Update Secrets Manager DB endpoint / credentials mapping only after verification.
4. Run `pnpm db:migrate:status` against restore target.
5. Point ECS task definition / secret to restore cluster after smoke.
6. Do **not** delete the failed cluster until verification window closes.

## Secrets / config restoration

- DB admin + app secrets: Secrets Manager names `forge-production-secrets-database*`
- Rotate application connections by updating secret JSON + ECS force-new-deployment
- Preserve KMS key policies; restores must use same or compatible CMK grants

## Restore drill (empty DB)

After empty production Aurora exists, create a snapshot and restore to
`forge-production-rds-aurora-drill-*`, confirm availability, then delete the
drill cluster only (never Development). Document `SNAPSHOT_ID` / `CREATED_AT` /
`STATUS` in the PROD-S0R evidence log.

## Explicit non-goals

- No customer data in drills
- No Firebase export restore into Aurora as part of this procedure
