# FX Component Governance

**Document:** `39-component-governance.md`  
**Phase:** FX-S1  
**Status:** APPROVED  
**Author:** Forge Experience Program  
**Last Updated:** 2026-07-30

## Purpose

Define ownership, approval, versioning, and promotion rules for shared FX components.

## Scope

Packages: `@forge/fx-design-tokens`, `@forge/fx-ui`, `@forge/fx-layouts`, `@forge/fx-patterns`, `@forge/fx-hooks`, `@forge/fx-icons`, `@forge/fx-utils`, and the reference app.

## Goals

- One shared library
- No silent breaking changes
- Accessibility and tokens mandatory

## Definitions

| Term             | Meaning                                    |
| ---------------- | ------------------------------------------ |
| Shared component | Exported from `@forge/fx-*`                |
| Extension        | Product composition without forking        |
| Promotion        | Advancing maturity toward production-ready |

## Responsibilities

| Role                   | Responsibility                             |
| ---------------------- | ------------------------------------------ |
| FX maintainers         | Own shared packages, reviews, deprecations |
| Product teams          | Consume; propose extensions via RFCs       |
| Accessibility reviewer | Gate AA on new components                  |

## Approval process

1. Spec in `docs/forge-experience/components/` or Storybook/playground
2. Implementation in `@forge/fx-*` only (not product apps)
3. A11y + token review
4. Update readiness matrix (`40`)
5. Reference app demo required before “Validated”

## Versioning

- Semver within FX packages
- Minor: additive variants
- Major: breaking props/DOM contracts

## Deprecation

- Announce in changelog + readiness matrix
- Minimum one minor cycle before removal
- Provide migration notes

## Backward compatibility

- Prefer additive APIs
- Do not change shared workflow state meanings

## Extension rules

- Products may compose and supply data
- Products may not copy/fork component source into apps
- No hard-coded colors/spacing outside tokens

## Breaking change policy

- Requires FX maintainer approval + major bump + migration note

## Documentation requirements

Per FX-S0 template + playground/Storybook example

## Testing requirements

- Unit where logic exists
- Visual/state coverage in playground
- Keyboard + focus checks

## Accessibility requirements

WCAG 2.2 AA; focus visible; names; contrast across themes

## Promotion to production

Only after: FX-S1 exit gate approved, component maturity ≥ Validated, platform stabilization complete, and product migration phase authorized (FX-S2+).

## Anti-patterns

- Landing new shared UI inside RMS/Academy/Industrial directly
- Shipping without high-contrast check

## Acceptance criteria

- [x] Governance documented for FX-S1

## Revision history

| Date       | Change        |
| ---------- | ------------- |
| 2026-07-30 | Initial FX-S1 |
