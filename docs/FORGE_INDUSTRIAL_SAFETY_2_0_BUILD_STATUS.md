# Forge Industrial Safety 2.0 — Build Status

Branch: \`forge-creator-2.0\`

This document is the working implementation ledger for Forge Industrial Safety 2.0. A module is not considered production-ready until migrations, build, runtime behavior, authorization, and security regression tests pass in the target environment.

## Platform foundation

| Area | Status | Notes |
| --- | --- | --- |
| Multi-tenant organization core | Built | Organizations, memberships, Locations, Divisions, tenant isolation foundation |
| Forge Creator 2.0 | Built foundation | Tenant provisioning, features, entitlements, access, experience, forms, lookups, AI controls |
| Roles & Permissions | Built foundation | Role templates, tenant roles, individual overrides, effective scopes |
| Feature Entitlements | Built foundation | Plan + tenant overrides + runtime feature availability |
| Experience Builder | Built foundation | Creator ceiling + tenant presentation controls |
| Dropdown / Lookup Manager | Built | Creator and tenant configuration |
| Forms & Fields | Built foundation | Creator-driven forms and tenant-safe overrides |
| Audit | Built foundation | Creator/domain action audit events |
| Local Supabase | Built foundation | Local development ports/configuration and seed environment |
| AWS production | Not deployed | Intentionally deferred while local development continues |

## Runtime modules

| Module | Status | Major implemented capability |
| --- | --- | --- |
| Personnel | Built foundation | Scoped personnel records, profile, assignment metadata |
| Training | Built foundation | Courses, assignments, completions, approvals |
| My Training | Built | User-specific assignment/transcript view |
| Incidents | Built foundation | Incident workflow, scope, activity, **scoped equipment links** (merged PR #3) |
| Inspections | Built foundation | Templates, inspections, checklist records, findings |
| Assets & Equipment | Built foundation | Asset identity, assignment, maintenance, meters, retirement, related incident history |
| QR Management | Built foundation | Managed QR tokens, scan resolver/history, asset destinations |
| Lockout / Tagout | Built foundation | Equipment procedures, energy sources, ordered steps, approvals, revisions, reviews, field-use history |
| Tasks | Built foundation | Tasks/corrective actions, assignment, due dates, completion, comments, activity |
| Customer Support | Built foundation | Tenant tickets, Forge triage, internal notes/attachments, SLA settings, smoke + CI (merged PR #4) |
| Corrective Actions / CAPA | Built foundation | First-class CAPA lifecycle linked to Tasks; cancel/reopen/verify; cross-tenant 404 smoke + CI (merged PR #6); NX-01 workflow adapter sync |
| Universal Workflow + Evidence Core | Built (NX-01 + NX-01H + NX-01R) | Shared workflow engine, resource registry + permission-specific scope, relationship registry, record links, approvals, acknowledgments, comments, evidence, activity; CAPA atomic lifecycle incl. form open→in_progress; Incident↔Asset universal sync; Creator platform diagnostic loader |
| OSHA | Not built | Feature registry exists; runtime required |
| Workers Compensation | Not built | Feature registry exists; restricted runtime required |
| DOT Compliance | Not built | Feature registry exists; runtime required |
| Fleet | Not built | Feature registry exists; runtime required |
| Emergency Management | Not built | Feature registry exists; runtime required |
| Calendar | Not built | Navigation placeholder exists; runtime/feature registry required |
| Reminders | Not built | Navigation placeholder exists; runtime/feature registry required |
| Messaging | Not built | Navigation placeholder exists; runtime/feature registry required |
| Reporting | Partial | Forge AI Analytics exists; native reporting/report builder still required |
| Safety Supplies | Not built | Runtime and feature registry required |
| Food Safety | Not built | Runtime and feature registry required |
| Grain Sanitation | Not built | Runtime and feature registry required |
| Print Manager | Not built | Runtime and feature registry required |
| Photo Markup | Not built | Runtime and feature registry required |

## Forge AI

| AI capability | Status |
| --- | --- |
| Tenant AI entitlement and Creator controls | Built foundation |
| Chat workspace and conversation history | Built foundation |
| Permission-aware runtime tools | Built |
| Personnel search/context | Built |
| Training search/context | Built |
| Incident search/context | Built |
| Inspection search/context | Built |
| Assets search/context | Built |
| QR search/context | Built |
| LOTO search/context | Built |
| Tasks search/context | Built |
| Forge Knowledge | Built foundation |
| Human-approved AI action queue | Built foundation |
| Initial approved actions | Inspection finding, Asset maintenance |
| AI Watch | Built foundation |
| Watch rules | Training, Inspection, Assets, Incidents, LOTO, Tasks |
| AI Analytics | Built foundation |
| Analytics domains | Executive, Incidents, Training, Inspections, Assets |
| Saved AI reports | Built foundation |
| AI Draft Studio | Not built |
| Image/document multimodal workflows | Not built |
| Voice workflows | Not built |
| AI evaluation/security suite | Not built |

## Current validation state

**NX-00 baseline locked** on \`forge-creator-2.0\` — see \`docs/NX00_INTEGRATION_BASELINE_LOCK.md\`.

**NX-01 + NX-01H + NX-01R complete** on \`codex/nx01-universal-workflow-evidence-core\` (PR #7) — see \`docs/NX01_UNIVERSAL_WORKFLOW_EVIDENCE_CORE.md\`.

Shared workflow / record-links / approvals / acknowledgments / comments / evidence / activity foundation is in place with authoritative resource registry, permission-specific Location/Division scope, atomic CAPA lifecycle (including form-driven open→in_progress), Creator platform diagnostic loader, and Incident↔Asset universal link sync.

Required ongoing checkpoint for later modules:

1. Pull \`forge-creator-2.0\` (or current integration branch).
2. Confirm Docker Desktop is running.
3. Run \`pnpm web:supabase:reset\` (or \`pnpm --filter forge-industrial-safety-2.0-web supabase:reset\`).
4. Confirm every migration and \`seed.sql\` complete successfully.
5. Run \`node scripts/check-forge-ai-schemas.cjs\`, web type-check, and build.
6. Run workflow-core + support + CAPA + incident-equipment Playwright smokes.

Do not mark a module Production Ready solely because its code has been committed.

## Recommended implementation order from here

Governed by `docs/FORGE_NEXT_LEVEL_FUNCTIONALITY_MASTER_DIRECTIVE.md` and the NX sprint pack (start **NX-02** only after NX-01 gates are green on the integration branch).

1. NX-01 — Universal workflow + shared evidence core *(complete including NX-01H)*.
2. NX-02 — Observations + Risk Register + JSA/JHA.
3. NX-03 — Permit-to-Work engine.
4. Continue NX-04…NX-21 per the next-level sprint pack.
5. Reporting / dashboard builder and exports (as scheduled in waves).
6. Forge Guardian / Risk Pulse / Command Center after workflow + risk backbone.
7. AWS production deployment and migration runbook (final hardening).
