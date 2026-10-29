# S2F-2 Incident Review — Migration Plan

## Composition

| Surface              | FX when                            | Compatibility                                            |
| -------------------- | ---------------------------------- | -------------------------------------------------------- |
| Queue `/review/`     | `module.incidentReview` ∧ `tables` | Legacy HTML table                                        |
| Officer review forms | `module.incidentReview` ∧ `forms`  | Legacy `OfficerReviewPanel` markup                       |
| Specialty review     | Always legacy (compat)             | Unchanged panel                                          |
| Review “workspace”   | Incident workspace REVIEW section  | Lives inside incident record; no separate `/review/{id}` |

## Rules

- Module flag never forces foundations on.
- Independent of `fx.rms.module.incidents.enabled`.
- Payload parity: identical API helpers and arguments.
