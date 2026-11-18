# ADR-013: Person, User, and Authentication Identity separation

**Status:** Accepted  
**Date:** 2026-07-25  
**Sprint:** 1D

## Context

People exist in HR/workforce data independently of login. A single person may have multiple tenant memberships or auth methods over time. Conflating person, product user, and IdP identity makes offboarding, SSO, and sensitive-data handling harder.

## Decision

**Three distinct concepts, linked by foreign keys — never collapsed into one table.**

1. **Person** — real-world individual in domain data (employment, profile attributes).
2. **User** — tenant-scoped product principal with roles/permissions and membership lifecycle.
3. **Authentication Identity** — external IdP subject (Cognito/OIDC) bound to a User for sign-in.

Person may exist without a User; User requires a Person; Authentication Identity attaches to User, not Person directly.

## Consequences

- Clear offboarding: disable User / unlink identity without deleting Person history.
- Supports multiple auth providers and re-binding without rewriting domain records.
- Queries and APIs must join deliberately; “current user” always resolves through User + auth identity.
