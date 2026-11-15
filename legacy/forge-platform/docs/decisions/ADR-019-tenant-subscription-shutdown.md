# ADR-019: Tenant subscription suspension and expiry

**Status:** Accepted  
**Date:** 2026-07-25  
**Sprint:** 1D

## Context

When a subscription is suspended or expired, product use must stop without destroying tenant data or blocking billing/status recovery. Hard deletion on non-payment is unsafe and often non-compliant.

## Decision

**Deny product APIs; allow limited auth for status/billing; retain data.**

1. Suspended or expired subscription → reject product/domain API calls with a clear subscription-state error.
2. Authentication may continue so the tenant can reach status, billing, and reactivation flows.
3. Do **not** delete tenant data solely because of suspension or expiry; retention/deletion follows separate policy and explicit offboarding.
4. Entitlement and subscription state are checked at the API edge (see ADR-017).

## Consequences

- Safe commercial shutdown without irreversible data loss.
- Clients must handle subscription-denied separately from auth failure.
- Ops/support need clear reactivation path; long-suspended tenants still consume storage until offboarded.
