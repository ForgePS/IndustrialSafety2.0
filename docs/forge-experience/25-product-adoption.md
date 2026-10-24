# FX Product Adoption Strategy

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 4)  
**Author:** Forge Experience Program  
**Last Updated:** 2026-07-30

## Purpose

Define how products extend FX without replacing it, and the phased adoption plan.

## Scope

Forge RMS · Forge Academy · Forge Industrial Safety · future Forge applications.

## Goals

- Products extend; they do not replace
- RMS becomes the reference implementation
- Later products reuse shared components

## Definitions

| Term        | Meaning                                                     |
| ----------- | ----------------------------------------------------------- |
| Extension   | Domain records, widgets data, module dashboards, extra tabs |
| Replacement | Forbidden parallel shell/design system                      |

---

## Product extension standards

### Forge RMS may extend FX with

Incident Operations · Fire Prevention · Hydrants · Fleet · Scheduling · Personnel · NERIS · EMS

### Forge Academy may extend FX with

Courses · Students · Housing · Testing · Certifications · Instructors · Skills Evaluations · Learning Management

### Forge Industrial Safety may extend FX with

LOTO · JSA · Permits · Contractors · Equipment · Safety Observations · Industrial Training · Compliance

### Rules

- Register extensions through FX extension points
- Reuse shell, tokens, components, patterns
- Do not fork navigation metaphors or workflow state meanings

---

## Adoption phases

### Phase 1 — Forge Experience Foundation (this phase)

Documentation · Standards · Architecture · Wireframes · Component specifications

**Status:** FX-S0 complete (docs). Production UI migration **not** started.

### Phase 2 — Adopt FX in Forge RMS

RMS becomes the **reference implementation**.

### Phase 3 — Migrate Forge Academy

Reuse RMS/FX shared components wherever possible.

### Phase 4 — Migrate Forge Industrial Safety

Reuse shared components; implement only product-specific functionality.

### Phase 5 — Future Forge Applications

Automatically inherit Forge Experience.

---

## Success metrics

| Metric                   | Target                          |
| ------------------------ | ------------------------------- |
| Duplicated UI components | Reduce ≥ **80%**                |
| Component library        | Single shared library           |
| Navigation framework     | Single framework                |
| Design tokens            | Single token system             |
| Workflows                | Consistent across products      |
| Onboarding time          | Reduced for new users           |
| Accessibility            | Improved WCAG 2.2 AA compliance |
| Maintainability          | Improved                        |
| Future module effort     | Reduced                         |

## Best practices

- Gap-analyze each product screen against FX patterns before rewriting
- Prefer adopt-in-place over big-bang rewrites after approval

## Anti-patterns

- Academy inventing a second design system while waiting for RMS
- “Temporary” product shells that become permanent

## Future enhancements

- Automated drift detection vs FX component inventory

## Dependencies

- FX-S0 foundation approval · Platform stabilization complete before production UI migration

## Implementation notes

**Stop conditions apply** — see [32-acceptance-and-stop-conditions.md](./32-acceptance-and-stop-conditions.md).

## Acceptance criteria

- [x] Extension lists documented
- [x] Phases 1–5 documented
- [x] Success metrics documented

## Revision history

| Date       | Change                   |
| ---------- | ------------------------ |
| 2026-07-30 | Part 4 adoption strategy |

## Related

- [02-product-boundaries.md](./02-product-boundaries.md)
- [33-migration-strategy.md](./33-migration-strategy.md)
- [27-roadmap.md](./27-roadmap.md)
