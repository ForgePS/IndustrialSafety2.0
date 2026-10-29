# Platform API Versioning Policy

**Sprint:** 1E  
**Status:** Accepted ([ADR-028](../decisions/ADR-028-platform-api-versioning.md))  
**Frozen surface:** `/api/v1` at Sprint 1E Wave 9

## Summary

**Freeze `/api/v1` at the end of Sprint 1E; break only by cutting `/api/v2`.**

Forge Industrial, RMS, and Academy should consume the documented contract ([platform-contract-v1.md](./platform-contract-v1.md)) rather than reimplementing platform logic.

## What `/api/v1` means

The v1 contract includes:

- HTTP paths under `/api/v1`
- Request and response shapes documented in [platform-openapi-v1.yaml](./platform-openapi-v1.yaml)
- Error codes in [platform-errors-v1.md](./platform-errors-v1.md)
- Permission codes in [platform-permissions-v1.md](./platform-permissions-v1.md)
- Cross-cutting headers: `Authorization`, `Idempotency-Key`, `If-Match`, `ETag`, `X-Request-Id`
- Correlation fields in `meta.requestId` and `meta.correlationId`

Implementation source: NestJS controllers in `apps/platform-api/src/modules/` and Zod schemas in `@forge/contracts`.

## Allowed changes within v1 (non-breaking)

| Change                                               | Example                                   |
| ---------------------------------------------------- | ----------------------------------------- |
| New optional JSON fields on responses                | Add `lastLoginAt` to user summary         |
| New endpoints under `/api/v1`                        | Onboarding session routes (Wave 5)        |
| New enum values on fields documented as open         | New `INVITATION_STATUSES` terminal reason |
| New permission codes (additive catalog)              | Future product permissions                |
| New domain event types with new `.v1` suffix strings | `platform.membership.expired.v1`          |
| New query parameters with defaults                   | `sort` on a list endpoint                 |
| Pagination metadata additions                        | Cursor token alongside page numbers       |

Clients should ignore unknown JSON fields and tolerate new enum values on open fields.

## Changes that require `/api/v2`

| Change                                      | Example                                     |
| ------------------------------------------- | ------------------------------------------- |
| Remove or rename a response field           | Rename `recordVersion`                      |
| Tighten validation on existing fields       | Reject previously accepted slug             |
| Change default behavior                     | Silent auto-activate on create              |
| Change error code for an existing condition | Map stale version to `409` instead of `412` |
| Remove an endpoint                          | Drop legacy user invite path                |
| Change authentication scheme                | Non-Cognito primary auth                    |

## Domain events vs HTTP API

Domain event types use an independent `.vN` suffix (`platform.tenant.created.v1`). Event schema evolution does **not** automatically require an HTTP version bump.

Breaking event payload changes publish under a new type string (for example `.v2`) while HTTP remains v1 until a separate breaking HTTP change forces `/api/v2`.

Catalog: [platform-events-v1.md](./platform-events-v1.md).

## Deprecation process (future)

When `/api/v2` is introduced:

1. Document v2 alongside v1 for at least one sprint.
2. Mark v1 endpoints deprecated in OpenAPI and release notes.
3. Set a sunset date per environment (development first).
4. Monitor v1 traffic via API access logs and CloudWatch metrics.
5. Remove v1 only after agreed sunset and zero critical consumers.

No v2 work is in scope for Sprint 1E.

## Documentation maintenance

| Artifact                     | Update trigger                 |
| ---------------------------- | ------------------------------ |
| `platform-contract-v1.md`    | Any v1-visible behavior change |
| `platform-openapi-v1.yaml`   | Route or schema change         |
| `platform-events-v1.md`      | New or changed event types     |
| `platform-permissions-v1.md` | New permission codes           |
| `platform-errors-v1.md`      | New `ForgeErrorCode` values    |
| This policy                  | Versioning rule change only    |

Wave 10 deploy verification updates `docs/sprints/SPRINT-1E-summary.md` and `docs/project-status.md`; this policy file changes only when the rules themselves change.

## Infrastructure versioning note

Edge TLS (ACM, Route 53, HTTPS redirect) is configuration-gated ([ADR-025](../decisions/ADR-025-edge-tls-and-dns.md)). Enabling HTTPS is not an API version change.

Creator Console hosting (CloudFront + S3 static export, [ADR-026](../decisions/ADR-026-creator-console-hosting.md)) is independent of `/api/v1`.
