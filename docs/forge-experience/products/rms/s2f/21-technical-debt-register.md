# 21 — Technical Debt Register (S2F-8)

**Date:** 2026-07-31  
**Rule:** None of the following are implemented in S2F.

| ID         | Item                                                             | Type            | Notes / retirement criteria                   |
| ---------- | ---------------------------------------------------------------- | --------------- | --------------------------------------------- |
| TD-S2F-001 | Dual legacy + FX markup trees per page                           | Compatibility   | Retire only after GA + soak; never during S2F |
| TD-S2F-002 | Specialty review remains legacy chrome                           | Deferred FX     | Separate authorization                        |
| TD-S2F-003 | `/login/` not FX-migrated                                        | Auth boundary   | Explicit out of S2F-7 scope                   |
| TD-S2F-004 | CAD unmapped / mappings not migrated                             | Deferred        | Separate CAD utility authorization            |
| TD-S2F-005 | `/cad/operations/` not under module flags                        | Deferred        | Separate authorization                        |
| TD-S2F-006 | FieldRenderer specialty chrome                                   | Compatibility   | Deferred from S2E                             |
| TD-S2F-007 | Seed descriptions for early modules still say “Not wired until…” | Docs cleanup    | Cosmetic; flags are wired                     |
| TD-S2F-008 | E2E scaffold is smoke-only                                       | Test debt       | Expand under Pilot program                    |
| TD-S2F-009 | Performance lab numbers absent                                   | Evidence debt   | Capture in pilot                              |
| TD-S2F-010 | Sanitized screenshot pack incomplete                             | Evidence debt   | Required before GA                            |
| TD-S2F-011 | S2F-4 connection multi-type / secret-masking validation          | Pilot condition | From S2F-4 approval conditions                |
| TD-S2F-012 | Planning vs live gaps (activity feed, admin consoles, etc.)      | Scope debt      | Documented N/A; do not invent                 |

## Compatibility inventory (do not remove)

| Location                                     | Purpose                   |
| -------------------------------------------- | ------------------------- |
| Legacy branches in migrated `page.tsx` files | Instant rollback          |
| `OfficerReviewPanel` `presentation` prop     | FX/legacy officer review  |
| Legacy shell adapter                         | Shell flag off            |
| Module resolvers / hooks                     | Composition + diagnostics |
