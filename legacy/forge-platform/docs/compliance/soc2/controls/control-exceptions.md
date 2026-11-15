# Control Exceptions

**Document ID:** SOC2-CTL-005  
**Version:** 0.1 (draft)  
**Date:** 2026-07-26

Track approved deviations from expected control operation.

| Exception ID | Control ID | Description                                    | Risk ID | Approved by | Start | End | Status |
| ------------ | ---------- | ---------------------------------------------- | ------- | ----------- | ----- | --- | ------ |
| EX-000       | —          | Template — no exceptions formally approved yet | —       | —           | —     | —   | —      |

### Known gaps tracked as risks (not yet formal exceptions)

These are **open gaps**, not approved exceptions. Convert to EX-* only if management accepts delayed remediation:

- CC-LOG-01 CloudTrail — see R-002
- CC-ACC-03 Access reviews — see R-003
- CC-IR-01 Incident response program — see R-013
- A-AVL-03 Restore testing — see R-005

### Exception rules

1. Exceptions require owner, residual risk, compensating control (if any), and end date.
2. Expired exceptions must be closed, extended with re-approval, or escalated.
3. Do not use exceptions to authorize false SOC 2 certification claims.
