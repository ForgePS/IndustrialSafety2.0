# NX-01 — Universal Workflow + Shared Evidence Core

**Status:** NX-01 + NX-01H + NX-01R + NX-01R2 + NX-01R3 on `codex/nx01-universal-workflow-evidence-core`  
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
| NX-01R remediation | `node apps/web/tests/nx01r-remediation-db.cjs` |
| NX-01R2 CAPA transactional | `node apps/web/tests/nx01r2-capa-transaction-db.cjs` |
| NX-01R3 client concurrency | `node apps/web/tests/nx01r3-capa-client-concurrency-db.cjs` |
| NX-01R3 Playwright | `pnpm exec playwright test apps/web/tests/nx01r3-capa-client-concurrency.spec.cjs` |
| Playwright NX-01 | `pnpm exec playwright test apps/web/tests/workflow-core-smoke.spec.cjs --workers=1` |
| Playwright Creator workflows | `pnpm exec playwright test apps/web/tests/creator-workflows-smoke.spec.cjs --workers=1` |
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

## PR #7 Review Remediation (NX-01R)

### Evidence permission-specific scope
`requireForgePermissionForResource` evaluates a named permission’s own effective scope (org / location / division / own / assigned / custom) against a resolved Forge resource. Parent module manage access no longer overrides narrower shared permissions.

Evidence upload requires **both**:
1. parent record manage authorization; and
2. `records.evidence.upload` scoped to that record.

The same pattern applies to `records.evidence.view|manage`, `records.comments.*`, `records.links.*`, `records.acknowledgements.*`, `workflow.transition`, and `workflow.approve`.

### Atomic form-driven CAPA lifecycle
Superseded by NX-01R2 transactional form saves (below).

### Creator platform loader separation
`listWorkflowDefinitions` remains tenant-secured (`activeOrganization` + `workflow.view`).
`/admin/creator/workflows` uses `listPlatformWorkflowDefinitions` (platform role via `getForgePlatformAccess`) so Forge Owner/Creator/Read-only can inspect core definitions without an active tenant entitlement.

### Added regression tests
- `apps/web/tests/nx01r-remediation-db.cjs` — evidence scope contract, form-path failure/success/idempotency, concurrent transition conflict, reconciliation, platform loader contract
- `apps/web/tests/creator-workflows-smoke.spec.cjs` — platform owner sees definitions; tenant user denied Creator route

## NX-01R2 Transactional CAPA Form Saves

### Row version / concurrency
`forge_corrective_actions.row_version` (bigint, default 1) increments on every controlled mutation. Form saves and lifecycle RPCs require matching expected version/status or return `conflict: true`.

### Transactional field + lifecycle command
`forge_update_capa_transactionally` applies a **whitelisted** field patch (never `status`) and optionally performs `open→in_progress` (`start_work`) in one transaction with workflow event, activity, audit, idempotency, and linked-task sync.

### Idempotency identity
Form commands use `capa:{id}:update:{expectedRowVersion}:{requestId}`. Retries of the same submission reuse the request UUID; new user saves mint a new UUID and must use the current row version.

### Field-only audit transaction
Field-only edits still write CAPA fields + row_version + module/shared activity + creator audit in the same DB transaction. Failure injection rolls everything back.

### Linked Task decision
**Required invariant for form saves:** when `linked_task_id` is set, task field/status sync and task activity are included in `forge_update_capa_transactionally`. Lifecycle-only button transitions continue to sync tasks after the lifecycle RPC (adjacent) and emit outbox for later reconciliation if needed. Async outbox consumer remains deferred for non-form paths.

### Stale-write / conflict UX
Stale forms receive a conflict error (“This record changed after you opened it. Refresh the record before saving your changes.”) without applying fields or reverting lifecycle status. UI clears the submission request id and refreshes. Dirty field values are retained until the user refreshes.

### Bugbot findings remediated
- Form save can revert CAPA status — fixed (status omitted from field updates; row_version guards)
- Failed start-work skips field audit — fixed (single transactional command)

## NX-01R3 Client Concurrency Synchronization

### Server-authoritative concurrency tokens
Successful `updateCorrectiveAction` returns a typed contract:

```ts
{ ok: true, id, message, rowVersion: number, status: string }
```

or `{ ok: false, error, conflict?: true }`. Tokens are post-transaction values from `forge_update_capa_transactionally` (`row_version` / `capa_status`), never pre-transaction guesses.

### Local row version / status state
`CorrectiveActionRecordForm` keeps `currentRowVersion` / `currentStatus` (UI) and matching refs as the save-time source of truth. Initialized from the loaded record. Every save sends `expectedRowVersion = currentRowVersionRef.current` and `expectedStatus = currentStatusRef.current`. The client never increments version locally and never infers `in_progress` from field content.

### Sequential-save behavior
After success, the form adopts `result.rowVersion` / `result.status` **before** clearing the submission request id. A same-browser Edit → Save → Edit → Save flow therefore uses N, then N+1, then N+2 without false conflicts. `router.refresh()` may refresh SSR props but is not required for concurrency correctness.

### Prop refresh synchronization
If SSR later provides a newer `initialValues.row_version`, local tokens advance only when the incoming version is greater than the current local version (never backwards).

### True stale-browser behavior
Two sessions at version N: Browser A saves → local N+1; Browser B still at N → save CONFLICT. Browser B must not overwrite A. Conflict UX shows the refresh message, retains dirty local fields, and does not auto-resubmit stale values against the newer version.

### Request ID lifecycle
- Before submission: mint UUID if none.
- Retries of the same unresolved attempt: reuse the same id.
- After successful token adoption: clear the id.
- On conflict: clear/rotate so the next user save is a new logical request.

### Tests
- `apps/web/tests/nx01r3-capa-client-concurrency.spec.cjs` — sequential field saves, lifecycle-then-field, two-browser stale conflict
- `apps/web/tests/nx01r3-capa-client-concurrency-db.cjs` — returned rowVersion/status contract + client source audit

## Known remaining limitations

- Polymorphic `resource_id` has no cross-table FK (app + registry validated).
- Lifecycle button paths sync linked tasks adjacent to the lifecycle RPC (form path is transactional).
- No drag-and-drop workflow designer.
- Outbox rows are written; async consumer processing is optional for later waves.

## Deferred

NX-02+ modules (Observations, Risk, JSA, PTW, Guardian, etc.).
