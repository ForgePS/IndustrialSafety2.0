# NX-01 — Universal Workflow + Shared Evidence Core

**Status:** NX-01 + NX-01H complete on `codex/nx01-universal-workflow-evidence-core`  
**Baseline:** `forge-creator-2.0` @ `19ec04e`  
**Migrations:**
- `20260924330000_forge_universal_workflow_core.sql`
- `20260924340000_forge_nx01h_hardening.sql`

## Objective

Production shared foundation for workflow definitions/states/transitions/instances/events, polymorphic record links, approvals, acknowledgments, comments, evidence, and human-readable activity — with CAPA as the first real domain proof via an adapter (CAPA remains system of record).

## Schema

| Table | Purpose |
| --- | --- |
| `forge_workflow_definitions` | Core (`organization_id` null) and tenant workflow definitions; versioned |
| `forge_workflow_states` | States per definition; exactly one initial (unique partial index) |
| `forge_workflow_transitions` | Allowed transitions + permission/comment/approval/rule_config |
| `forge_workflow_instances` | One active instance per org/resource/definition |
| `forge_workflow_events` | Append-only transition history |
| `forge_workflow_idempotency_keys` | Duplicate transition prevention |
| `forge_record_links` | Polymorphic cross-module links (archive, not hard-delete) |
| `forge_approval_requests` / `forge_approval_steps` | Shared approval flow |
| `forge_record_acknowledgements` | Controlled acknowledgments with uniqueness |
| `forge_record_comments` / `forge_record_comment_revisions` | Shared comments + edit history |
| `forge_record_activity` | Human-facing activity feed (not a substitute for audit) |
| `forge_record_evidence` | Private evidence metadata (`forge-evidence` bucket) |
| `forge_domain_event_outbox` | Durable post-transition fan-out (NX-01H) |

Existing domain tables (`forge_corrective_action_*`, `forge_incident_assets`, Support attachments) are retained.

## RLS

- Tenant-owned tables: RLS enabled; authenticated **SELECT** scoped with `is_org_member(organization_id)`.
- Mutations brokered by **service role** after server-side authz (same pattern as Support/CAPA).
- Evidence + idempotency keys: no authenticated grants (server-only).
- Workflow events: no UPDATE/DELETE grants for authenticated users.

## Constraints & indexes

- Unique core/tenant workflow key+version
- One initial state per definition
- Unique active instance per org/resource/definition
- Unique active record link tuple
- Unique acknowledgment (person + resource + type + version)
- Idempotency unique per instance key
- Indexes on org + resource, instance, status, occurred_at / created_at

## Atomic transitions

`forge_perform_workflow_transition(...)` updates instance + inserts event (+ idempotency row) in one function. Same idempotency key returns `{ ok, duplicate: true, event_id }` without double-applying.

## Backend services

| File | Role |
| --- | --- |
| `forgeWorkflow.ts` | Definitions, instances, allowed transitions, `performTransition`, history, sync RPC |
| `forgeCapaWorkflowSync.ts` | CAPA SoR adapter: ensure + sync after CAPA lifecycle mutations |
| `forgeRecordLinks.ts` | Create/archive/list + resource registry validation |
| `forgeComments.ts` | Shared comments |
| `forgeEvidence.ts` | Evidence metadata + archive + signed download helpers |
| `forgeApprovals.ts` | Request + decide (no self-approval) |
| `forgeAcknowledgements.ts` | Create/list acknowledgments |
| `forgeRecordActivity.ts` | Write/list shared activity |
| `forgeAudit.ts` | Writes to existing `forge_creator_audit_log` |
| `forgeResourceRegistry.ts` | Explicit supported resource types + org loaders |

## CAPA proof integration

- CAPA status remains authoritative on `forge_corrective_actions`.
- After create/update/submit/verify/close/cancel, adapter maps status changes to core workflow transitions (`corrective_actions.lifecycle` v1) and calls the atomic RPC with idempotency keys.
- Detail page ensures an instance exists and shows shared workflow badge, timeline, comments, links, evidence, approvals, acknowledgments, and shared activity.
- Domain CAPA comments/activity/controls unchanged.

## Record-link strategy

- New modules use `forge_record_links`.
- Incident ↔ Asset continues on `forge_incident_assets` (no risky cutover in NX-01).
- Future consolidation documented as dual-read → migrate → deprecate.

## Evidence

- Private bucket `forge-evidence` (10 MB).
- Upload: `POST /api/evidence/upload` (origin check, permission, MIME/size, metadata insert, orphan cleanup on failure).
- Download: `GET /api/evidence/[evidenceId]` → short-lived signed URL after `records.evidence.view`.

## Permissions / feature

Feature `workflow_core` entitled on `internal-demo` / `enterprise`. Permissions include `workflow.*`, `records.links.*`, `records.comments.*`, `records.evidence.*`, `records.acknowledgements.*`. Granted to company-admin/owner templates and employee (subset).

## Creator UI

`/admin/creator/workflows` — diagnostic list of definitions, states, transitions (no drag-and-drop designer).

## Tests

| Test | Command |
| --- | --- |
| DB/RPC | `node apps/web/tests/workflow-core-db.cjs` |
| NX-01H hardening | `node apps/web/tests/nx01h-hardening-db.cjs` |
| Playwright NX-01 | `pnpm exec playwright test apps/web/tests/workflow-core-smoke.spec.cjs --workers=1` |
| Regressions | support / corrective-actions / incident-equipment smokes |

## NX-01H Hardening

### Resource registry
`forgeResourceRegistry.ts` is the authoritative polymorphic access layer: typed descriptors, `resolveForgeResource`, `requireForgeResourceView` / `Manage`, `requireCompatibleForgeResources`, and Location/Division/`CUSTOM` scope evaluation via effective permissions + `getTenantScopeAssignments`.

Registered types: corrective_action, task, incident, inspection, inspection_finding, asset, loto_procedure, loto_application, training_course, training_assignment, personnel, support_ticket.

### Relationship registry
`forgeRelationshipRegistry.ts` whitelists relationship keys (`involves_asset`, `generated_capa`, `implemented_by`, `related`, …). Callers cannot invent types.

### CAPA atomic lifecycle
`forge_perform_capa_lifecycle_transition` updates CAPA SoR + workflow instance + immutable event + idempotency + module/shared activity + audit + outbox in one transaction. Submit/verify/close/cancel call this RPC after server-side authz. Explicit map in `forgeCapaWorkflowMap.ts`. Reconciliation: `forge_reconcile_capa_workflow_states`.

### Incident ↔ Asset universal linking
Domain table `forge_incident_assets` remains authoritative for incident UI. Trigger `sync_incident_asset_record_link` + idempotent backfill keep `forge_record_links` (`involves_asset`) consistent.

### Evidence / comments / approvals / acknowledgments / activity / workflow history
Shared services authorize parent resources through the registry before read/write. Evidence download re-checks access; storage paths are service-role only.

## Known remaining limitations

- Polymorphic `resource_id` has no cross-table FK (app + registry validated).
- Linked-task side effects after CAPA atomic transition remain adjacent (not in the CAPA/workflow RPC).
- Form-driven CAPA field updates that flip `open`→`in_progress` still write SoR then workflow-only sync.
- No drag-and-drop workflow designer.
- Outbox rows are written; async consumer processing is optional for later waves.

## Deferred

NX-02+ modules (Observations, Risk, JSA, PTW, Guardian, etc.).
