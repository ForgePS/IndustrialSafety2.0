# MK-S5 Complete — Products / Modules / Entitlements

**Program:** FORGE-SAAS-CORE  
**Sprint:** MK-S5  
**Completed:** 2026-08-10  
**Verdict:** PASS  
**Repair passes used:** 1 (web-kit deps for entitlements export; simplify membership module load)

## Objective achieved

Central entitlement helpers, UI session/nav filters, time-window aware module activation, and a representative server product gate (facilities → `FORGE_INDUSTRIAL`).

## Scope completed

- `entitlement-domain` contracts + catalog
- `requireEntitlement` + permission×entitlement matrix tests
- Module `startsAt`/`endsAt` honored in `loadEntitlements`
- Facilities `@RequirePermission(..., { requiresEntitlement })`
- web-kit exports + `useProductEnabled` / `useModuleEnabled`
- `ENTITLEMENTS.md`; BACKLOG-013…015

## Reused

- EntitlementsService / products APIs
- evaluateAuthorization requiresEntitlement
- filterNavigationForSession

## Extended

- Session entitlement window filtering
- Facilities product gate
- Explicit contract API expected by web-kit

## New

- `packages/contracts/src/entitlement-domain.ts`
- Docs `ENTITLEMENTS.md`

## Verification

| Check                                             | Result    |
| ------------------------------------------------- | --------- |
| contracts unit                                    | 18 passed |
| authorization unit                                | 41 passed |
| web-kit unit                                      | 19 passed |
| platform-api facilities/entitlements/auth-context | 21 passed |
| typecheck affected                                | PASS      |
| Production operations                             | NONE      |

## Next sprint

NOT AUTHORIZED.
