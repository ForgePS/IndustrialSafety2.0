# Full regression report — Forge RMS (development)

**Date:** 2026-07-28 (America/Chicago)  
**Environment:** development (`511343547817` / `us-east-1` / `forge-dev`)  
**RMS base URL:** `https://d3ud5uzwd9js2z.cloudfront.net`  
**API:** `https://d108fstxdv69bo.cloudfront.net`  
**Suite:** `@forge/rms-web-e2e` (Playwright, chromium + mobile-chrome where matched)

## Verdict

**PASS** (after one assertion fix)

Bar: **0 failed / 0 skipped** on the RMS Playwright full suite. Initial run had **1** brittle failure; fixed and re-verified. No tests skipped.

## RMS Playwright results

| Metric   | Initial full run | After fix                          |
| -------- | ---------------- | ---------------------------------- |
| Passed   | 54               | 54 + fixed test re-verified PASS   |
| Failed   | 1                | 0 (failure root-caused and fixed)  |
| Skipped  | 0                | 0                                  |
| Duration | ~12.3m           | fix re-run ~7.3s wall / 952ms test |
| Workers  | 1                | 1                                  |

### Initial failure (resolved)

| Spec                                    | Issue                                                                                                       | Fix                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `tests/ai-narrative-foundation.spec.ts` | Strict-mode: heading regex `/sign in\|log in\|forge/i` matched both `Sign in` (h1) and `Forge account` (h2) | Assert `getByRole("heading", { name: "Sign in", level: 1 })` |

Re-run: `pnpm exec playwright test tests/ai-narrative-foundation.spec.ts` → **PASS**.

### Coverage notes

- Phase 3 specialty / accessibility / attachment / mobile matrices included
- Phase 4 CAD acceptance, KEEP_FORGE conflict, reprocess included
- AI Narrative foundation smoke (panel hidden when flags off / public login) included
- Credentials via gitignored `apps/rms-web-e2e/.env.e2e.local` (Phase 4 synthetic admins)

## platform-api e2e (out of Playwright bar)

Recorded for visibility; **not** used for the RMS Playwright green bar.

| Metric   | Value |
| -------- | ----- |
| Passed   | 4     |
| Failed   | 1     |
| Skipped  | 11    |
| Duration | ~45s  |

| Issue                                | Notes                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `sprint-1e.e2e.test.ts` skipped (11) | Harness seed failed: duplicate `platform_modules` key for `AI_NARRATIVE` |
| NERIS Phase 1 overlay mutation test  | Expected 200, got 500 on `tenant_neris_configuration` query              |

Follow-up tracked separately; does not block RMS UI regression PASS above.

## Constraints honored

- Phase 5 not started
- Production AI enablement not performed
- Phase 4 CAD tenant AI flags left off
- Application database secret not rotated
- Worker service not redeployed for this regression pass

## Conclusion

RMS Playwright full regression meets the **0 failed / 0 skipped** bar after correcting the AI Narrative login-heading assertion. Report path: `docs/testing/full-regression-report.md`.
