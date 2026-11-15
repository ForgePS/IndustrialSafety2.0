# ADR-027: Resumable customer onboarding sessions

**Status:** Accepted  
**Date:** 2026-07-25  
**Sprint:** 1E

## Context

Customer onboarding spans several steps (organization, products, subscription, administrator invitation, security, and branding) and can be interrupted by a browser refresh or a return visit. Holding this state only in the client loses progress and gives no server-side view of partially onboarded tenants. We need a persisted, resumable, auditable onboarding process with a server-controlled activation gate.

## Decision

**Onboarding is a persisted aggregate with an ordered step child table and a server-side activation gate.**

1. Onboarding is a persisted `customer_onboarding_sessions` aggregate with an ordered `customer_onboarding_steps` child table, rather than client-side wizard state.
2. Each step records status (PENDING, COMPLETED, SKIPPED, FAILED), its captured payload, and validation errors.
3. The tenant is created in PROVISIONING at step 1.
4. The tenant transitions to ACTIVE only when every activation check passes: a primary organization exists, at least one product is enabled, the subscription is valid or explicitly waived, a primary administrator invitation exists, security configuration is valid, branding defaults are valid, and no critical error is outstanding.
5. Sessions are resumable and auditable.

## Consequences

- Partially onboarded tenants are visible and recoverable instead of lost on a browser refresh.
- Activation is a server-side gate that the console cannot bypass, so a tenant cannot go live with missing prerequisites.
- Onboarding introduces an extra aggregate to maintain, with its own lifecycle and history.
- Capturing per-step payloads and validation errors makes stalled onboarding diagnosable rather than opaque.
