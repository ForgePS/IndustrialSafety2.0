# FX Product Gap Analysis (FX-S1)

**Document:** `41-product-gap-analysis.md`  
**Phase:** FX-S1  
**Last Updated:** 2026-07-30

Maps products against shared FX building blocks. **No production code changed in S1.**

Legend: **Reuse** (consume FX as-is) · **Extend** (domain data/tabs) · **Replace** (remove product fork) · **Debt** (known divergence)

## Forge RMS

| Area            | Assessment       | Notes                                                                      |
| --------------- | ---------------- | -------------------------------------------------------------------------- |
| Components      | Extend / Debt    | Uses `@forge/ui` + design-system today — plan map to `@forge/fx-ui` in S2  |
| Layouts / shell | Replace (future) | Multiple shells; adopt FxAppShell in S2 reference path only after approval |
| Navigation      | Debt             | Product IA must map to 3-level FX nav                                      |
| Patterns        | Extend           | Incident/prevention/hydrants/fleet as extensions                           |
| Forms           | Extend           | Domain schemas on FX forms                                                 |
| Dashboards      | Extend           | Module dashboards via FX widgets                                           |

## Forge Academy

| Area       | Assessment     | Notes                               |
| ---------- | -------------- | ----------------------------------- |
| Components | Reuse (future) | Prefer RMS FX package after S2      |
| Layouts    | Extend         | Courses/students/housing workspaces |
| Navigation | Extend         | Training-oriented work areas        |
| Patterns   | Extend         | Enrollment, certifications          |
| Forms      | Extend         | Testing / evaluations               |
| Dashboards | Extend         | Training progress widgets           |

## Forge Industrial Safety

| Area       | Assessment     | Notes                          |
| ---------- | -------------- | ------------------------------ |
| Components | Reuse (future) | After Academy/RMS path         |
| Layouts    | Extend         | LOTO/JSA/permits workspaces    |
| Navigation | Extend         | Safety work areas              |
| Patterns   | Extend         | Permit approve/reject          |
| Forms      | Extend         | JSA / LOTO steps               |
| Dashboards | Extend         | Compliance / readiness widgets |

## Cross-cutting debt

- Parallel design tokens in legacy packages
- Import Center / Creator Console not FX shells (out of S1 scope — do not modify)
- Chart/map widgets not yet prototyped in code

## Related

- [25-product-adoption.md](./25-product-adoption.md)
- [42-migration-readiness.md](./42-migration-readiness.md)
