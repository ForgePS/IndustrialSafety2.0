# MK-S6 Complete — Invitations / Member Management

**Program:** FORGE-SAAS-CORE  
**Sprint:** MK-S6  
**Completed:** 2026-08-10  
**Verdict:** PASS  
**Repair passes used:** 0

## Objective achieved

Invitation lifecycle hardened (resend expiry, email bind, facility scope); member list search and facility scope API; security unit coverage for expired/revoked/wrong-email/cross-tenant/role-escalation policy.

## Scope completed

- Invitation status SaaS aliases
- Migration `0029_mk_s6_invitations.sql` (`facility_ids_json`)
- Invite `facilityIds` + membership `setFacilityScope`
- Resend extends `expiresAt` (+168h)
- Accept optional `email` must match invite
- Membership list `q` email search
- Security unit tests
- `INVITATIONS.md`; BACKLOG-016

## Reused

- ADR-020/021 invitation and membership services
- `assertGrantable` for role escalation

## Extended

- Resend expiry; accept email bind; member search; facility scope storage

## New

- invitation-domain contracts
- Additive facility_ids_json columns

## Verification

| Check                  | Result    |
| ---------------------- | --------- |
| contracts unit         | 21 passed |
| invitations unit       | 7 passed  |
| platform-api typecheck | PASS      |
| Production operations  | NONE      |

## Next sprint

NOT AUTHORIZED.
