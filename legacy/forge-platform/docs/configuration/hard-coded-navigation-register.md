# Hard-coded navigation register (final)

**Date:** 2026-07-28

| File                                                 | Line(s)                              | Hard-coded value                                       | App          | Classification        | Exception/Defect                                     | Priority | Target phase     | Owner    |
| ---------------------------------------------------- | ------------------------------------ | ------------------------------------------------------ | ------------ | --------------------- | ---------------------------------------------------- | -------- | ---------------- | -------- |
| `apps/creator-console/src/components/app-shell.tsx`  | 11–117                               | Full `navGroups` (Overview…AI…Settings + Studio links) | Creator      | HARD_CODED_ACTIVE     | Platform admin chrome; not tenant navigation payload | P2       | Config hardening | Platform |
| `apps/tenant-admin/src/components/app-shell.tsx`     | navGroups                            | 13 delegated studio routes                             | Tenant Admin | HARD_CODED_ACTIVE     | Should load published `navigation` where safe        | P2       | Config hardening | Platform |
| `apps/rms-web/src/components/app-shell.tsx`          | records/operations/configuration nav | Feature-flag gated static groups                       | RMS          | HARD_CODED_ACTIVE     | Hook loads navigation JSON; shell not fully switched | P1       | Config hardening | Platform |
| `apps/rms-web/src/hooks/use-tenant-config-studio.ts` | navigation consumer                  | Partial wiring                                         | RMS          | PARTIAL_WIRING        | Defect vs full consumption                           | P1       | Config hardening | Platform |
| `packages/configuration/src/index.ts`                | DEFAULT_PAYLOADS.navigation          | Default groups                                         | Shared       | APPROVED_DEFAULT_SEED | Seed only                                            | —        | N/A              | Platform |

Security note: account/login routes must remain reachable even if tenant navigation hides items; route authorization remains separate.
