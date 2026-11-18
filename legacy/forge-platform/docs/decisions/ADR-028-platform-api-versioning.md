# ADR-028: Platform API Contract v1 and versioning policy

**Status:** Accepted  
**Date:** 2026-07-25  
**Sprint:** 1E

## Context

Forge Industrial, RMS, and Academy will build on the platform API, so they need a stable surface they can depend on without re-implementing platform logic. Without an explicit contract and versioning policy, additive changes and breaking changes look the same to consumers and every change risks breaking a product team.

## Decision

**Freeze `/api/v1` at the end of Sprint 1E; break only by cutting `/api/v2`.**

1. `/api/v1` is frozen at the end of Sprint 1E and documented in `docs/api/`.
2. Additive changes (new optional fields, new endpoints, and new enum values in fields documented as open) are allowed within v1.
3. Removing or renaming a field, tightening validation, changing an error code, or changing default behaviour requires `/api/v2`.
4. Domain event types carry an explicit `.vN` suffix and are versioned independently of the HTTP API.
5. Forge Industrial, RMS, and Academy consume this contract rather than reimplementing platform logic.

## Consequences

- Product teams can build against a stable surface, knowing additive changes will not break them.
- The platform team absorbs the cost of maintaining parallel versions when a breaking change forces `/api/v2`.
- Enum growth must be planned for by consumers, since fields documented as open can gain new values within v1.
- Versioning events independently of the HTTP API lets event schemas evolve without forcing an HTTP version bump.
