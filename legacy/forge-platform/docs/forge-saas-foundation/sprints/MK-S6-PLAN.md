# MK-S6 Plan — Invitations / Member Management

## Objective

Harden invitation lifecycle and member administration: invite/resend/revoke/accept with secure tokens, expiration/duplicate handling, member list/search, role changes, facility scope, deactivate/reactivate/remove, and security tests.

## Current State

- ADR-020 invitations: hash-only tokens, Cognito provision at send, link at accept, membership PENDING→ACTIVE.
- Workflows `create` / `resend` / `revoke` / `accept` / `list` exist.
- Gap: resend does not extend `expiresAt` (ADR-020 requires it).
- Gap: no facility scope on invitations/memberships.
- Gap: membership list has no email search.
- Gap: accept does not verify accepting email against invite.
- Gap: thin unit coverage for expired/revoked/wrong-email/cross-tenant invite.

## Reuse

- `InvitationsService` / `MembershipsService`
- `assertGrantable` / creator-only permission block
- Partial unique active invitation index
- SaaS membership status aliases (MK-S3)

## Changes Required

1. `invitation-domain` SaaS aliases (pending/accepted/expired/revoked).
2. Additive migration `0029`: `facility_ids_json` on `user_invitations` + `user_tenant_memberships`.
3. Create invitation accepts `facilityIds`; validate tenant ownership; copy to membership on create/accept.
4. `setFacilityScope` membership API.
5. Resend extends `expiresAt` (+168h default).
6. Accept optional `email` must match invitation email.
7. Membership list `q` / email search (ilike).
8. Security unit tests for invitation lifecycle denials + role escalation + cross-tenant invite.
9. `INVITATIONS.md`.

## Files Expected

```text
docs/forge-saas-foundation/sprints/MK-S6-PLAN.md
docs/forge-saas-foundation/sprints/MK-S6-COMPLETE.md
docs/forge-saas-foundation/INVITATIONS.md
packages/contracts/src/invitation-domain.ts
packages/database/drizzle/0029_mk_s6_invitations.sql
packages/database/src/schema/users.ts | memberships.ts
apps/platform-api/.../invitations.service.ts (+ tests)
apps/platform-api/.../memberships.service.ts | controller
```

## Database Changes

Additive columns only. Migration not executed in production this sprint.

## Security Impact

- Email bind on accept
- Resend expiry refresh
- Facility IDs validated to tenant
- Explicit invite cross-tenant forbid (existing) tested

## Tests Required

- expired token denied
- revoked token denied
- token reuse denied
- wrong email denied
- role escalation prevented (grant creator-only via invite roles)
- other tenant invite inaccessible
- resend extends expiresAt
- membership email search

## Out of Scope

- Full invite UX redesign
- Cognito production config changes
- MK-S7+ onboarding
- Scheduled expire worker (BACKLOG if needed)

## Risks

- Clients that omit accept `email` remain compatible (optional field).
- Facility scope is JSON list, not RLS row filter — document as authorization hint until product APIs enforce facility ACL.
