# MK-S0 Plan — Baseline / Discovery

## Objective

Understand Forge SaaS capabilities before architecture changes. Establish program control files, capability matrix, architecture diagrams, and baseline verification results so later sprints reuse existing systems instead of duplicating them.

## Current State

- Forge is a pnpm/turbo monorepo with NestJS `platform-api`, ECS workers, Cognito auth, Drizzle/Postgres + RLS, and multiple Next.js product UIs.
- Substantial SaaS core already exists (tenants, memberships, RBAC, invitations, entitlements, subscriptions with `billingProvider=NONE`, feature flags, onboarding, audit, Creator Console, Tenant Admin).
- Unrelated in-progress industrial-web / analytics work is present on `master` and must not be disturbed.
- `docs/forge-saas-foundation/` does not yet exist.

## Reuse

Use existing architecture docs and ADRs as discovery sources:

- `docs/architecture/platform-core.md`, `multi-tenancy.md`, `authorization.md`, `subscriptions-entitlements.md`, `identity-architecture.md`
- ADRs 012–022, 026–029
- Packages `@forge/tenant-context`, `@forge/authorization`, `@forge/auth`, `@forge/database`, `@forge/audit`, `@forge/web-kit`

## Changes Required

Documentation and program control files only:

1. Create `docs/forge-saas-foundation/` and `sprints/`
2. Write `PROGRAM_STATE.json`, `ACTIVE_SPRINT.md`, `BACKLOG.md`
3. Inventory apps/packages/AWS and SaaS capabilities
4. Write `MK-S0-baseline.md` with capability matrix + Mermaid diagrams
5. Run repository-defined verification; record outcomes without fixing historical failures
6. Write `MK-S0-COMPLETE.md`, update program state, commit docs only

## Files Expected

```text
docs/forge-saas-foundation/PROGRAM_STATE.json
docs/forge-saas-foundation/ACTIVE_SPRINT.md
docs/forge-saas-foundation/BACKLOG.md
docs/forge-saas-foundation/MK-S0-baseline.md
docs/forge-saas-foundation/sprints/MK-S0-PLAN.md
docs/forge-saas-foundation/sprints/MK-S0-COMPLETE.md
```

## Database Changes

None.

## Security Impact

None (read-only discovery + documentation). No production AWS mutations. No secret retrieval.

## Tests Required

Run existing repo scripts for baseline evidence:

- `pnpm test:unit` (or scoped feasible baseline)
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build` if feasible within sprint time; otherwise document skip reason
- Note any production-check script if present; do not invent one

Do not repair unrelated historical failures.

## Out of Scope

- MK-S1+ implementation
- Auth, schema, billing, admin UI changes
- Framework upgrades or migrations
- Deployments / production operations
- Fixing industrial-web WIP or analytics gaps discovered during inventory

## Risks

- Full monorepo verification may be slow or partially fail for pre-existing reasons; document as baseline.
- Unrelated working-tree changes must not be committed with MK-S0.
