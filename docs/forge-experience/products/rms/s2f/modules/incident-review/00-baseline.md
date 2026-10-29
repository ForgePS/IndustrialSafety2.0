# S2F-2 Incident Review — Baseline

**Module:** Incident Review  
**Date:** 2026-07-31

## Live routes (verified)

| Route                             | Purpose                           |
| --------------------------------- | --------------------------------- |
| `/review/`                        | Officer review queue              |
| `/incidents/{id}/?section=REVIEW` | Review detail (workspace section) |

**Note:** `/review/{id}` and `/review/{id}?tab=` are **not** live routes in `rms-web`. Deep links preserve `/review/` and incident `?section=REVIEW`.

## Product gate

`rms.neris.officer_review.enabled` via `FeatureGate` `officerReview`.

## Actions (existing only)

| Action                | API                                       | Permission                         |
| --------------------- | ----------------------------------------- | ---------------------------------- |
| Re-run validation     | `validateIncident` / `listValidationRuns` | review                             |
| Submit for review     | `submitForReview`                         | `rms.neris.incident.submit_review` |
| Add comment           | `addReviewComment`                        | `rms.neris.incident.review`        |
| Return for correction | `returnIncident`                          | `rms.neris.incident.return`        |
| Approve               | `approveIncident`                         | `rms.neris.incident.approve`       |

## Status filter (queue)

Client filter using `REVIEW_STATUSES`: `READY_FOR_REVIEW`, `SUBMITTED_FOR_REVIEW`, `RETURNED_FOR_CORRECTION`, `APPROVED`.

## Specialty review

`SpecialtyReviewPanel` remains legacy presentation (compatibility) — same APIs; FX chrome deferred to avoid workflow risk.
