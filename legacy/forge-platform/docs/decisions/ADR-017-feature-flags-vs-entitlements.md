# ADR-017: Feature flags vs entitlements

**Status:** Accepted  
**Date:** 2026-07-25  
**Sprint:** 1D

## Context

Teams often overload “feature flags” for both launch control and paid packaging. That blurs billing truth, support expectations, and who may flip a capability for a tenant.

## Decision

**Keep feature flags and paid module entitlements separate.**

1. **Feature flags** — engineering/product kill-switches and gradual rollout (environment or percentage, short-lived).
2. **Entitlements** — commercial rights to modules/capabilities tied to subscription/plan; source of truth for “is this tenant allowed to use X.”
3. Product gates require entitlement for paid modules; flags may further restrict rollout but cannot grant unpaid access.
4. UI and APIs must not treat a flag alone as proof of purchase.

## Consequences

- Clear ownership: eng for flags, commercial/billing for entitlements.
- Two checks on some paths (entitled AND flagged on).
- Avoids support confusion when a “flag” was actually a sold module.
