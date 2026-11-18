# ADR-020: Invitation lifecycle and Cognito identity linkage

**Status:** Accepted  
**Date:** 2026-07-25  
**Sprint:** 1E

## Context

Bringing a new user into a tenant spans two systems: Forge (authorization and membership) and Cognito (credentials). A naive flow can create a Cognito user, then fail to link or activate membership, leaving a half-created account with no clear owner. We need a durable, auditable invitation aggregate that treats identity linkage and access activation as explicit, ordered steps.

## Decision

**Invitations are a first-class, tenant-scoped aggregate; identity links only at acceptance.**

1. An invitation moves through the states DRAFT, PENDING, SENT, ACCEPTED, EXPIRED, REVOKED, and FAILED.
2. A Cognito user is created via AdminCreateUser at send time. In non-production, message delivery is suppressed (SUPPRESS), and the temporary password is returned only through the development-only acceptance path and is never logged.
3. Forge identity is linked to the Cognito `sub` in `authentication_identities` only at acceptance, never at send time.
4. Membership is activated only after acceptance succeeds; role assignments activate only after membership activation.
5. Only one non-terminal invitation may exist per (tenant, email), enforced by a partial unique index.
6. Resend rotates the token hash and extends expiry; revoke is terminal.
7. Every transition writes an audit event and an outbox domain event (see ADR-016).

## Consequences

- Cognito is the credential store but never the authorization source; access decisions read Forge membership and roles, not Cognito.
- Acceptance is the only path that links a Forge identity to a Cognito `sub`, keeping the linkage point singular and auditable.
- A failed Cognito call moves the invitation to FAILED rather than leaving a half-created user in an ambiguous state.
- Token values are stored only as SHA-256 hashes, so a database read never exposes a usable invitation token.
- The partial unique index prevents duplicate outstanding invitations but requires terminal states to be modelled correctly so a new invitation can be issued after revoke or expiry.
