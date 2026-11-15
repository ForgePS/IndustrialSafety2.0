# Configuration Platform — tenant isolation report

**Date:** 2026-07-28  
**Evidence:** `docs/testing/evidence/config-final-acceptance/step3-isolation-api.json`

## Tenants

| Role | ID                                     | Alias                                                    |
| ---- | -------------------------------------- | -------------------------------------------------------- |
| A    | `019f9e06-a0b2-75f4-9e0b-5ae9befd8193` | rms-synthetic-fd (labeled config-acceptance-tenant-a)    |
| B    | `019fa5c5-6bd9-734c-ace5-76e0b8da28a0` | rms-ai-synthetic-fd (labeled config-acceptance-tenant-b) |

## API isolation

Actor: AI synthetic admin user (`019fa5c5-6bd9-…7eb7…`) — **no membership** on tenant A/B routes when used as cross-tenant probe (avoids platform-admin TenantGuard bypass).

| Test                | HTTP | Pass |
| ------------------- | ---- | ---- |
| List B objects      | 401  | Yes  |
| Retrieve B versions | 401  | Yes  |
| Get B version       | 401  | Yes  |
| Compare B           | 401  | Yes  |
| Edit B draft        | 401  | Yes  |
| Publish B           | 401  | Yes  |
| Schedule B          | 401  | Yes  |
| Archive B           | 401  | Yes  |
| Rollback B          | 401  | Yes  |
| Export B            | 401  | Yes  |
| Import into B       | 401  | Yes  |
| Effective B         | 401  | Yes  |
| Audit B             | 401  | Yes  |

**Totals:** 13 deny tests — **0 successful cross-tenant reads/writes**. Error bodies used standard Forge contract (`UNAUTHORIZED`/`FORBIDDEN`) without tenant-B slug leakage in checked samples.

## Database RLS

| Check                                             | Result                                                         |
| ------------------------------------------------- | -------------------------------------------------------------- |
| FORCE RLS on `config_objects` / `config_versions` | **PASS** (`rs=true`, `force=true`, `current_user=forge_app`)   |
| Cross-tenant SELECT leak                          | **PASS** `leaked=[]`                                           |
| Cross-tenant INSERT                               | **PASS** blocked                                               |
| Cross-tenant version SELECT count                 | **PASS** `0`                                                   |
| Evidence                                          | `docs/testing/evidence/config-final-acceptance/step3-rls.json` |

## Limitations

1. Dedicated `config-acceptance-tenant-*` rows could not be created (`POST /platform/tenants` 500 under RLS).
2. Membership-scoped Tenant A/B users not provisioned; API isolation used principal without target membership (401).
3. Platform admin bypasses TenantGuard by design — not used as isolation actor.

**API isolation verdict:** PASS (0 cross-tenant success).  
**DB RLS verdict:** PASS.
