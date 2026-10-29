# Import Platform S8 — Tenant Isolation

**Document:** `docs/testing/import-platform-s8-tenant-isolation.md`  
**Date:** 2026-07-30  
**Honesty rule:** RLS pass ≠ full HTTP isolation matrix.

## Verified

| Check                                                          | Status               | Evidence                                                |
| -------------------------------------------------------------- | -------------------- | ------------------------------------------------------- |
| FORCE RLS + cross-tenant deny (DB verify suite)                | **VERIFIED** 45/45   | Post-deploy ECS task `1ddecfd893184a6f929aed5e28c77a04` |
| Cross-tenant reads/writes / bypass / metadata leakage counters | **0** (suite totals) | Same run                                                |

### Evidence file note (`s8-rls-verify.json`)

The checked-in JSON may still show an earlier task ARN (`11803659bc6045b5bff1c09c7bc2f4f0`, verifiedAt `2026-07-29T23:04:21.000Z`) with `45/45`. **Post-deploy closeout re-verify** used task id **`1ddecfd893184a6f929aed5e28c77a04`** and also reported **45/45**. Prefer citing the post-deploy task id for S8 closeout; refresh the JSON artifact when convenient.

## Partial / not verified

| Check                                                 | Status                                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Full API endpoint isolation matrix beyond RLS harness | **PARTIALLY_VERIFIED** (prior S2 e2e lineage + RLS) — live S8 endpoint matrix **NOT_VERIFIED** |
| Browser tenant-switch cache clearing                  | **NOT_VERIFIED** (Playwright suite added; run failed)                                          |
| Cross-tenant privileged download                      | **NOT_VERIFIED**                                                                               |

## Deployed baseline

Tag `import-s8-20260729182259`, API `:40`, worker `:25`, migration `0027`.

## Related

- `docs/security/import-platform-tenant-isolation-report.md`
- Gap GAP-030 / GAP-031
- LIM-IMP-012
