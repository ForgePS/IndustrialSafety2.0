# Import Platform — Threat Model (S8)

**Document:** `docs/security/import-threat-model.md`  
**Method:** Practical STRIDE-oriented summary bound to shipped controls

## Assets

| Asset                             | Classification                                     |
| --------------------------------- | -------------------------------------------------- |
| Uploaded files                    | Tenant confidential; may contain PII / credentials |
| Import rows / mappings / previews | Tenant confidential                                |
| Execution journal                 | Integrity-critical operational                     |
| Scan events / verdicts            | Security evidence                                  |
| Presigned URLs                    | Short-lived capability tokens                      |
| Queue messages                    | Identifiers only (still tenant-sensitive ids)      |

See `docs/security/import-data-classification.md`.

## Actors

| Actor                 | Intent                                        |
| --------------------- | --------------------------------------------- |
| Tenant operator       | Legitimate import within entitlements         |
| Malicious tenant user | Cross-tenant read/write, privilege escalation |
| External attacker     | Upload malware, abuse presigns, scrape APIs   |
| Insider / support     | Over-broad access, unsafe DLQ replay          |
| Compromised worker    | Replay commits, exfiltrate S3                 |

## Threats and mitigations

| ID  | Threat                                    | Mitigation                                              | Residual                                                |
| --- | ----------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| T1  | Cross-tenant data access                  | FORCE RLS; tenant session; API authZ                    | Browser cache evidence incomplete (LIM-IMP-012)         |
| T2  | Malware upload / execution                | Scan gate; quarantine; fail-closed execute              | Reference scanner only — **Outcome B** blocks prod-like |
| T3  | Override infected → execute               | No override HTTP; UI unavailable                        | Pressure for unsafe ops procedures                      |
| T4  | Presign leakage                           | Short TTL; no queue URLs; client dispose                | Browser disposal evidence OPEN                          |
| T5  | Sensitive field disclosure                | Masking; `import.sensitive`; credentials never returned | Heuristic sensitivity (LIM-IMP-007)                     |
| T6  | Duplicate commits on retry                | Execution journal + idempotency keys                    | Adapter correctness for future products                 |
| T7  | Poison queue / DLQ abuse                  | maxReceiveCount; inspect without Body; confirm replay   | Operator error on replay                                |
| T8  | Privilege escalation via UI-only checks   | Server enforces `import.*`                              | Misconfigured role grants                               |
| T9  | Assuming SFN security gate is live        | Option B inactive; gates in API/worker                  | Doc drift / false ops assumptions                       |
| T10 | Production imports with reference scanner | `assertScannerAllowedForEnvironment`                    | Mis-set `APP_ENV` labeling                              |

## Abuse cases

1. **Upload EICAR / synthetic signals in development** — expected quarantine/fail paths for tests.
2. **Attempt upload in staging with reference provider** — must fail with `IMPORT_SCANNER_PROVIDER_UNAVAILABLE`.
3. **DLQ redrive of quarantined job** — forbidden without security review.
4. **Privileged download without `import.sensitive`** — API denies.
5. **Force COMPLETED on stuck job** — prohibited; stuck-job runbook is non-destructive.

## Acceptance constraints

- Outcome B remains until Outcome A provider authorized.
- No product adapters expand write surface in S8.
- Threat model updates required when scanner provider or SFN activation lands.

## References

- Architecture security: `docs/architecture/import-security.md`
- Access matrix: `docs/security/import-access-control-matrix.md`
- ADRs under `docs/decisions/`
