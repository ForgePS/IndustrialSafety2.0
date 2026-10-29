# TRAINING-S0 — Employee Training Portal / LMS Recon

**Checkpoint:** `FORGE-INDUSTRIAL-TRAINING-PORTAL`  
**Date:** 2026-08-23  
**Branch:** `industrial/training-employee-portal`  
**Baseline SHA:** `ee7abb2a1665614f5e3e655d704271650be459f5`

## Reuse map (Model A)

| Logical entity    | Existing table                                  | Action                                              |
| ----------------- | ----------------------------------------------- | --------------------------------------------------- |
| Training Course   | `industrial_training_sources`                   | Extend with versions                                |
| Course Version    | —                                               | **Add** `industrial_training_course_versions`       |
| Section / Content | materials + folders only                        | **Add** sections + content items                    |
| Question Bank     | `industrial_training_questions`                 | Reuse (per source)                                  |
| Assignment        | `industrial_training_assignments`               | Extend `course_version_id`                          |
| Assignee progress | `industrial_training_assignment_assignees`      | Reuse + progress table                              |
| Access Link       | assignment `public_token_hash` only             | **Add** `industrial_training_access_links`          |
| Portal Session    | `industrial_training_portal_sessions` (0062)    | Extend `access_link_id`                             |
| Attempt           | `industrial_training_attempts`                  | Reuse (`answers` jsonb)                             |
| Completion        | `industrial_training_records` + assignee status | **Add** canonical `industrial_training_completions` |
| Groups            | `industrial_training_groups`                    | Extend members with `personnel_id`                  |

## API patterns to follow

- Authenticated LMS: `IndustrialTrainingController` → `industrial-training.service.ts`
- Assignments/QR: `industrial-training-assignments.service.ts`
- Public portal: `IndustrialPublicTrainingController` → `industrial-public-training.service.ts`
- Token hashing: SHA-256 of base64url token; SECURITY DEFINER tenant lookup (0059, 0062, DVIR 0054)
- Tenant scope: `withTenantTransaction` + RLS `app.current_tenant_id`

## Frontend patterns

- Admin: `training-workspace.tsx` → `training-agency-panel.tsx`
- Learner (auth): `training-study-panel.tsx`
- Public QR: `training-public-workspace.tsx`, `/training/[token]`
- Personnel: `personnel-profile-panels.tsx` + `/api/v1/industrial/personnel/:id/analytics`

## Gaps addressed in S1–S8 (this sprint)

1. Company portal access links + `/training/access/{token}` route
2. Course versions, sections, progress persistence
3. Canonical completions entity
4. Employee training dashboard (all assignments via company QR)
5. Course player with resume
6. QC analytics API + admin panel
7. Bulk assign by department/site
8. Rate limiting on public identify
9. Personnel training tab with completion history

## Out of scope / deferred

- Certificate PDF generation (schema hook only)
- PIN second factor (schema-ready via access link policy json)
- Recurring assignment scheduler jobs (policy columns only)
- Full multi-select / image question types (existing MCQ engine retained)

## Production

Per directive §79: **no production deploy** during this implementation.
