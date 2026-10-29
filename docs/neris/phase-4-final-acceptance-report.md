# NERIS Phase 4 — Final acceptance report (engineering)

**Date:** 2026-07-27  
**Environment:** development (`511343547817` / `us-east-1` / `forge-dev`)  
**Verdict:** **ACCEPTED_WITH_LIMITATIONS** for Phase 4 CAD / hybrid / ops on synthetic tenant A  
**Phase 5:** NOT AUTHORIZED

## Deterministic Acceptance Closeout

### KEEP_FORGE conflict test result

**PASS** — `apps/rms-web-e2e/tests/phase-4-keep-forge-conflict.spec.ts`  
`KEEP_FORGE conflict resolution end-to-end`

Creates its own connection, manual incident, Forge `primaryIncidentTypeCode`, CAD link, finalize, then simulator `update-incident` with conflicting CAD value. Asserts OPEN conflict fields (CAD/Forge values, field identifier, ownership policy, source event, recommended resolution), `KEEP_FORGE` resolve with required reason, Forge value unchanged, history retained, `MANUALLY_RESOLVED`, resolver identity + timestamp, audit event, Tenant B denial, and unauthenticated denial. Fails hard if no conflict is created (no skip / early return).

### Reprocess test result

**PASS** — `apps/rms-web-e2e/tests/phase-4-reprocess.spec.ts`  
`reprocess quarantined message with idempotency and isolation`

Creates its own simulator raw message, quarantines via approved synthetic path, reprocesses twice (attempts increase; source message ID + payload hash stable; no duplicate incident), asserts audit + Tenant B / unauthorized denial.

### Conditional skip removal confirmation

Removed from `phase-4-cad-acceptance.spec.ts`:

- Early return when no CAD messages for reprocess
- Early return when no OPEN conflict for KEEP_FORGE
- Soft `test.skip(!hasSecondaryCredentials())` replaced with hard `expect(...).toBe(true)`

Dedicated deterministic specs own prerequisites (no reuse of stale prior-run records).

### Thirty-row assertion mapping

Authoritative mapping: [phase-4-assertion-mapping.md](testing/phase-4-assertion-mapping.md)  
Matrix source: [phase-4-cad-scenario-matrix.md](testing/phase-4-cad-scenario-matrix.md)

All **30** rows: **PASS** (allowed results only: PASS / FAIL / BLOCKED).

### Phase 4 Playwright totals

```
pnpm --filter @forge/rms-web-e2e exec playwright test --project=chromium --grep "@phase4"
```

**20 passed / 0 failed / 0 skipped** (includes KEEP_FORGE + reprocess + security suite).

### Full regression totals

```
pnpm --filter @forge/rms-web-e2e exec playwright test --project=chromium
```

**53 passed / 0 failed / 0 skipped** (Phase 2 + Phase 3 + Phase 4 + review workflow).

Officer review workflow re-verified via Cognito API-driven transitions in `review-workflow.spec.ts` (submit → return → correct → resubmit → approve → finalize → locked edit).

### Tenant-isolation results

**PASS** — Tenant B denied CAD connections / messages / conflicts / mappings / cross-tenant CAD status; feature-disabled tenant B CAD APIs forbidden; Phase 3 cross-tenant specialty + attachment isolation remain green in full regression.

### RLS results

**PASS (unchanged)** — Runtime continues under `forge_app` with FORCE RLS enabled (prior Phase 4 engineering verification; no secret rotation or role change in this closeout).

### Runtime results

| Check                                | Result                                        |
| ------------------------------------ | --------------------------------------------- |
| Account                              | `511343547817`                                |
| Region                               | `us-east-1`                                   |
| API HTTP                             | 200 (`https://d108fstxdv69bo.cloudfront.net`) |
| RMS HTTP                             | 200 (`https://d3ud5uzwd9js2z.cloudfront.net`) |
| Platform API task                    | `:20` healthy, desired/running **1/1**        |
| Worker task                          | `:19` healthy, desired/running **1/1**        |
| App secret ARN                       | `…database-app-SknUu5` **unchanged**          |
| App secret LastChangedDate           | `2026-07-26T15:30:16-05:00` **unchanged**     |
| Runtime DB role                      | `forge_app`                                   |
| FORCE RLS                            | enabled                                       |
| CAD DLQ depths (post-closeout purge) | **0** on all CAD DLQs                         |

**Worker fix deployed in closeout:** process-wide `getSharedDatabase()` to stop per-job postgres.js pool leaks that had starved CAD intake/match during earlier runs. Error logging now serializes real error messages (previously masked as `Unknown error`).

### CloudWatch results

CAD DLQ alarms exist. After DLQ purge, depths are 0; some alarm states may remain **ALARM** until CloudWatch evaluation periods clear (operational lag only). Application / normalization / retention DLQ alarms were **OK** at verification time.

### CloudTrail results

`forge-development-cloudtrail-management` — **IsLogging: true**.

### Remaining limitations

1. CloudWatch CAD intake/matching/polling DLQ alarms may lag **OK** for one evaluation window after synthetic DLQ purge.
2. Worker image for the pool-leak fix was rolled via ECS task definition `:19` (immutable ECR tag `closeout-20260727125918`); align future CDK/ECR “latest” tagging policy separately (ECR `latest` is immutable in this account).
3. CAD application queue is a completion notification channel without a dedicated consumer (by design for Phase 4); backlog there is non-blocking for conflict/reprocess acceptance.
4. SOC 2 remains readiness-only.

### Human product sign-off

Product owner: Jeremy Powell  
Role: Founder, Forge Public Safety  
Date: [actual approval date]  
Decision: [blank until approved]

Approval scope:

- Development environment
- Synthetic tenant A
- Synthetic CAD data
- Continued Forge RMS development

The approval does not authorize:

- Production CAD onboarding
- Production customer onboarding
- Enabling CAD for additional tenants
- Phase 5
- External NERIS submission
- ePCR
- AI narrative generation
- Offline synchronization

---

## Scope accepted

- Phases **4A–4E** code paths deployed to development
- Phase **4F** Cognito acceptance against live API + RMS
- Deterministic KEEP_FORGE + reprocess closeout scenarios
- Synthetic CAD only; PRODUCTION connection create remains rejected
- Tenant isolation: flags and CAD APIs denied for tenant B / cross-tenant

## Runtime endpoints

| Surface | URL                                   |
| ------- | ------------------------------------- |
| RMS     | https://d3ud5uzwd9js2z.cloudfront.net |
| API     | https://d108fstxdv69bo.cloudfront.net |

## Tenants

| Key                  | ID                                     | CAD flags                       |
| -------------------- | -------------------------------------- | ------------------------------- |
| `rms-synthetic-fd`   | `019f9e06-a0b2-75f4-9e0b-5ae9befd8193` | Enabled (all Phase 4 CAD flags) |
| `rms-synthetic-fd-b` | isolation tenant B                     | Off                             |

## Secret / Data safety

- Runtime app secret `forge-development-secrets-database-app` ARN suffix **`SknUu5`**
- `LastChangedDate` remains **`2026-07-26T15:30:16-05:00`**
- No application secret replace / rotate / regenerate during closeout

## Explicit stop

**Do not start Phase 5** without a new authorization directive.
