# Hard-coded terminology register (final)

**Date:** 2026-07-28

| File                                                 | Line(s)                      | Hard-coded value           | App          | Classification           | Exception/Defect                      | Priority | Target phase     | Owner    |
| ---------------------------------------------------- | ---------------------------- | -------------------------- | ------------ | ------------------------ | ------------------------------------- | -------- | ---------------- | -------- |
| `apps/rms-web/src/lib/constants.ts`                  | 16–39                        | `INCIDENT_SECTIONS` labels | RMS          | APPROVED_FALLBACK        | Defaults when terminology unpublished | P2       | Config hardening | Platform |
| `apps/rms-web/src/components/incident-workspace.tsx` | SECTION_LABELS               | Static section titles      | RMS          | APPROVED_FALLBACK        | Overlay via hook when published       | P2       | Config hardening | Platform |
| `apps/rms-web/src/components/incident-sections.tsx`  | DEFAULT_PERSONNEL_ROLES      | Fallback role labels       | RMS          | APPROVED_FALLBACK        | Prefer published dropdowns            | P1       | Config hardening | Platform |
| `apps/creator-console/src/components/app-shell.tsx`  | 11–117                       | Nav labels                 | Creator      | APPROVED_PLATFORM_CHROME | Platform chrome                       | P3       | Later            | Platform |
| `apps/tenant-admin/src/components/app-shell.tsx`     | navGroups                    | Module labels              | Tenant Admin | APPROVED_FALLBACK        | Consume published navigation          | P2       | Config hardening | Platform |
| `packages/configuration/src/index.ts`                | DEFAULT_PAYLOADS.terminology | Seed terms                 | Shared       | APPROVED_DEFAULT_SEED    | Intentional                           | —        | N/A              | Platform |
