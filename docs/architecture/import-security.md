# Import Platform — Security Architecture (S8)

**Document:** `docs/architecture/import-security.md`  
**ADRs:** malware Outcome B; Step Functions Option B

## Trust boundaries

| Boundary             | Control                                                           |
| -------------------- | ----------------------------------------------------------------- |
| Tenant data plane    | FORCE RLS on `import_*` tables (migrations `0022`–`0027`)         |
| API authZ            | `import.*` permissions on every mutating/sensitive route          |
| Object store         | Tenant-keyed S3 paths; SSE-KMS; short-lived presigns              |
| Queue                | Redacted messages (ids + correlation only; **no** presigned URLs) |
| Malware              | Provider interface + verdict gate before map/approve/execute      |
| Production-like envs | `assertScannerAllowedForEnvironment` fail-closed                  |

## FORCE RLS

Import tables use `FORCE ROW LEVEL SECURITY` (not merely ENABLE), including core tables from `0022`, profile versions (`0025`), execution journal (`0026`), scan events and security artifacts (`0027`). App connections use the application role with tenant session context.

## Malware scanning

| Item            | Value                                                                             |
| --------------- | --------------------------------------------------------------------------------- |
| Interface       | `ImportMalwareScanner`                                                            |
| Active provider | `reference-malware@1` (`ReferenceMalwareScanner`)                                 |
| Behavior        | CLEAN unless EICAR SHA-256 or synthetic key/file signals                          |
| Upload path     | Complete → enqueue `IMPORT_MALWARE_SCAN` → worker verdict → quarantine / continue |
| Rescan          | `import.validate`; justification when INFECTED/SUSPICIOUS/quarantined             |
| Override        | Verdicts reserved; **no** HTTP override endpoint                                  |

### Outcome B (production block)

Production-like `APP_ENV` values: `staging`, `production`, `govcloud-staging`, `govcloud-production`.

In those environments, reference provider returns `IMPORT_SCANNER_PROVIDER_UNAVAILABLE`. Enforced in API upload initialize/complete and worker malware processing. **No admin bypass.**

Development/testing (`local`, `development`, `testing`) may use the reference provider.

Source: `packages/imports/src/security/production-guards.ts`  
ADR: `docs/decisions/import-malware-provider-production-decision.md`

## Sensitive data

- Preview/results mask sensitive fields by default (name-hint heuristics + config; LIM-IMP-007).
- Download endpoints: default MASKED; `privileged=true` requires `import.sensitive`.
- Credentials/secrets remain non-returnable even with `import.sensitive`.
- Protected download client: fetch → blob object URL → revoke in `finally` (browser evidence still OPEN — LIM-IMP-013/014).

## Quarantine

Quarantined files block mapping/approval/execute/download paths. Rescan may change verdict per server rules. **No release-from-quarantine** product control (LIM-IMP-009).

## Audit

Mutating APIs require correlation / idempotency where specified. Scan events are immutable history (no raw malware payloads in API responses).

## Permissions

Canonical codes: `import.view`, `import.upload`, `import.map`, `import.validate`, `import.preview`, `import.approve`, `import.execute`, `import.rollback`, `import.profile.manage`, `import.template.manage`, `import.error.reprocess`, `import.sensitive`.

Matrix: `docs/security/import-access-control-matrix.md`  
Test matrix: `docs/imports/s8-permission-test-matrix.md`

## Threat model

See `docs/security/import-threat-model.md` and data classification `docs/security/import-data-classification.md`.
