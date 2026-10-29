# FX-S2F Module Checkpoint — Incident Review

**Date:** 2026-07-31  
**Module:** Incident Review (S2F-2)  
**Reference:** Forge Experience Design System v1.0.0-RC1

## Decision requested

```text
APPROVE NEXT S2F MODULE
```

Alternates: `APPROVE WITH CONDITIONS` · `RETURN FOR CORRECTION`

### Suggested conditions

1. Capture queue + approve/return screenshots before tenant enablement.
2. Keep `fx.rms.module.incidentReview.enabled` default-off.
3. Specialty review panel remains legacy until separately authorized for FX chrome.
4. Do not start S2F-3 CAD Messages until this checkpoint is accepted.

## Executive summary

Incident Review queue and officer-review action forms are composed behind `fx.rms.module.incidentReview.enabled` (default false) with foundation AND rules. APIs, permissions, validation engine, deep links (`/review/` → `?section=REVIEW`), and specialty review logic are unchanged. Legacy paths remain.

## Scope completed

- Review queue FX table gated by module ∧ tables
- Officer review FX form chrome gated by module ∧ forms
- Specialty review kept as compatibility/legacy presentation
- Module docs `00`–`09`
- Resolver unit tests

## Route inventory

| Route                             | Migrated                            |
| --------------------------------- | ----------------------------------- |
| `/review/`                        | Yes (presentation)                  |
| `/incidents/{id}/?section=REVIEW` | Officer panel yes; specialty legacy |
| `/review/{id}`                    | **N/A** — not a live route          |

## Component inventory

See `04-component-map.md`.

## Payload parity

Identical `submitForReview`, `returnIncident`, `approveIncident`, `addReviewComment`, `validateIncident` call sites and arguments.

## Workflow validation

Lifecycle transitions unchanged; action labels unchanged (Submit for review, Return for correction, Approve, Add comment, Re-run validation).

## Permission validation

FeatureGate + permission codes unchanged; module flag does not authorize.

## Accessibility

FX forms/table chrome patterns when FX surfaces active; validation summary uses `role="alert"`.

## Responsive validation

Foundation responsive CSS on FX surfaces; tablet action bars use 44px targets via FX buttons.

## Rollback results

Module off → legacy queue + legacy officer panel; other FX modules unaffected.

## Defects

| Sev | Count                                            |
| --- | ------------------------------------------------ |
| P0  | 0                                                |
| P1  | 0                                                |
| P3  | Specialty panel FX deferred; screenshots pending |

## Risks

| ID        | Notes                                                         |
| --------- | ------------------------------------------------------------- |
| R-S2F-005 | Specialty review still legacy — accepted compat               |
| R-S2F-006 | No dedicated `/review/{id}` route — documented live URLs only |

## Evidence index

`08-evidence.md` · unit tests · `s2f/14-evidence-index.md`

## Recommendation

**APPROVE NEXT S2F MODULE** (S2F-3 CAD Messages) after conditions.

---

**STOP:** CAD / NERIS / Administration not started.
