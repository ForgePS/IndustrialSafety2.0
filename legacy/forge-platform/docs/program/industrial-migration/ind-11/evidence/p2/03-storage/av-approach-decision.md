# AV approach decision (K3) — Producers P2 Phase 3

**Date:** 2026-08-05  
**Status:** DECIDED — Option B (time-boxed waiver) for Producers-only pilot  
**Applies to:** S3 **copy** and later download path (inventory may run with AV pending)

## Decision

| Field | Value |
| --- | --- |
| Option | **B — Time-boxed AV waiver** |
| Scope | Producers Rice Mill Firebase Storage → Forge S3 only |
| Waiver starts | 2026-08-05 |
| Waiver expires | **2026-09-05** (30 days) unless extended in writing |
| Rationale | Production scanner path not online for this pilot sprint; inventory + copy unblock needed for Phase 3 exit |

## Commitments before waiver expiry

1. Record object counts/checksums from inventory freeze.  
2. On or before expiry: either enable GuardDuty Malware Protection (or equivalent) on the destination bucket **or** extend this waiver with a new expire date.  
3. Sample re-scan of copied objects once a scanner is available (minimum: LOTO PDFs + certificates + random sample of images).  

## Explicit non-coverage

- Not a permanent production AV architecture  
- Not authorization for fleet-wide Industrial Storage copy  
- Does not waive signed Storage **copy** approval (K5) — still required before writes  

## Signature

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Program Owner | Jeremy | APPROVED (electronic, Cursor session 2026-08-05) | 2026-08-05 |
