# Security Backlog — FIS-SEC-AUDIT-001

Non-blocking and follow-on work after Critical presentation blockers are addressed.

## Authentication and session architecture

| Item | Severity | Business risk | Owner | Effort | Dependency | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| Move access/refresh tokens out of `localStorage` (BFF or HttpOnly cookies) | High | XSS session theft | Web platform | L | Cognito app client + CloudFront cookie domains | Tokens not JS-readable; login/refresh/logout e2e |
| Restrict `x-forge-dev-principal` to true local-only runtimes | Critical (fix) | Hosted auth bypass | Platform API | S | ECS task env review | api-dev rejects like production |
| Fix platform-admin membership shadow behavior + test | Medium | Support privilege confusion | Auth | S | ADR for support access | Unit + e2e select-tenant |

## Tenant isolation

| Item | Severity | Business risk | Owner | Effort | Dependency | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| Add CI job for Producers-safe synthetic dual-tenant IDOR suite | High | Undetected cross-tenant regressions | QA / API | M | Synthetic tenants in non-prod | Automated RG-01/02 green |
| Re-run DB RLS integration tests in CI with `forge_app` role | High | Query-level leakage | Database | M | Test DB | `test:rls` green |

## Role and permission model

| Item | Severity | Business risk | Owner | Effort | Dependency | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| Publish role-permission matrix from code + e2e checks | Medium | Hidden privilege paths | AuthZ | M | Seeded roles | Matrix matches PermissionGuard |

## Browser storage / offline mode

| Item | Severity | Business risk | Owner | Effort | Dependency | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| Field logout must call `clearAllOfflineData` (FIS-SEC-011) | Medium | Shared-device residual Field data | Field web | S | Existing helper | Offline empty after logout |
| Inventory IndexedDB/Cache Storage/service workers for tenant partition + logout wipe | Medium | Cross-user residual data on shared devices | Industrial web | M | Offline feature map | RG-09 checklist |

## CSP and deployment headers

| Item | Severity | Business risk | Owner | Effort | Dependency | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| Remove CSP `unsafe-inline`; use nonces/hashes | Medium | XSS execution | Infra | M | Static export pipeline | Header + smoke UI |
| Tighten `connect-src` to explicit API/CDN hosts | Medium | Data exfil via XSS | Infra | S | Known origins list | Header review |
| Strip `X-Powered-By` | Low | Fingerprinting | API | S | None | Header absent |

## File security

| Item | Severity | Business risk | Owner | Effort | Dependency | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| Re-verify signed URL TTL + tenant checks on Industrial attachments | Medium | Cross-tenant file access | API / storage | M | S3 policies | Cross-tenant ID denied |

## Import security

| Item | Severity | Business risk | Owner | Effort | Dependency | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| Reject ZIP `../` / absolute entry paths before extract (FIS-SEC-012) | Medium | ZIP Slip | Import platform | S | `formats/zip.ts` | Traversal fixture fails |
| Confirm import rows cannot set `tenantId` / roles; formula injection guards | Medium | Cross-tenant import / spreadsheet abuse | Import platform | M | Existing S8 tests | Import security suite |

## QR / public links

| Item | Severity | Business risk | Owner | Effort | Dependency | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| Remove client `permissions` from public scan authz (FIS-SEC-010) — **release blocker** | Critical | Public history/action elevation | Industrial API | S | Public QR controllers | Admin perms POST still 403 |
| Audit remaining `industrial-public-*` routes for client-trust authz | High | Similar bypasses | Industrial API | M | Controller inventory | Checklist + tests |

## Dependency upgrades

| Item | Severity | Business risk | Owner | Effort | Dependency | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| Triage `pnpm audit --prod` Critical/High for Industrial runtime reachability | High | Supply-chain exploit | Platform | M | Image SBOM | Patched or accepted with rationale |
| Review undici / multer advisories in consumed apps | Low–High | DoS / upload bypass | Owning apps | S | Audit paths | Upgrade or N/A writeup |

## Logging and auditability

| Item | Severity | Business risk | Owner | Effort | Dependency | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| Alert on `APP_ENV` drift and unexpected principal-header acceptance metrics | Medium | Silent reintroduction of bypass | Ops | S | Metrics pipeline | Alert fires in staging drill |

## AWS / IAM / infrastructure

| Item | Severity | Business risk | Owner | Effort | Dependency | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| Read-only IAM least-privilege + S3 public access block review | Medium | Cloud misconfig | Infra | M | AWS access | Checklist complete |
| Confirm production task definition cannot set `APP_ENV=development` | High | Auth bypass class regression | Infra | S | ECS | Guardrail / config test |

## Monitoring and incident response

| Item | Severity | Business risk | Owner | Effort | Dependency | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| Detect bursts of `x-forge-dev-principal` on any hosted env | High | Active exploitation signal | SecOps | S | ALB/WAF logs | Alert + playbook |

## Secure development lifecycle

| Item | Severity | Business risk | Owner | Effort | Dependency | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| Add pre-release gate checklist mirroring RG-01..10 to CI release workflow | Medium | Skipped security gates | Eng | M | This audit pack | Release blocked on fail |
| Sanitize legal HTML at write and read time | Medium | Stored XSS | Industrial | S | Sanitizer lib | Unit + UI test |

Effort key: S ≤ 2 days, M ≤ 2 weeks, L > 2 weeks.
