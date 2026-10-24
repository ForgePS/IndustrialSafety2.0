# Forge Experience Design System — VERSION

**Name:** Forge Experience Design System  
**Version:** `v1.0.0-RC1`  
**Release date:** 2026-07-30  
**Packages:** `@forge/fx-design-tokens`, `@forge/fx-utils`, `@forge/fx-icons`, `@forge/fx-ui`, `@forge/fx-hooks`, `@forge/fx-layouts`, `@forge/fx-patterns`  
**Reference app:** `apps/forge-experience-reference` (port 3010)

## Breaking changes

None vs prior RC (initial public RC). Relative to informal S1 scaffold:

- Chart / map / weather widgets promoted from placeholders to token-driven reference components
- `FxDialog` now includes focus trap, Escape dismiss, and focus restore
- Form field errors announce via `role="alert"`

## Known limitations

- Map drawing tools are reference-only and disabled (no GIS backend)
- Map is schematic SVG, not a production tile client
- No virtualized large tables / command palette in RC1
- Mobile shell lacks collapsible primary navigation
- `color-mix()` badge tints need solid fallbacks for older Safari
- Widgets use synthetic data only — must not bind RMS / Academy / Industrial APIs in this package set
- Distinct from legacy `@forge/ui` / `@forge/design-system` (do not mix casually)

## Future roadmap

1. Formal human approval of FX-S1.5 exit criteria
2. FX-S2 — Forge RMS migration onto FX RC1 (no product-specific UI divergence)
3. Collapsible phone navigation
4. Chart non-color encodings (patterns)
5. Virtualized data tables
6. Optional MapLibre adapter behind FX map contract
7. Stable `v1.0.0` after S2 pilot feedback

## Authorization

FX-S2 may begin **only after** formal approval of FX-S1.5. No production systems were modified to publish RC1.
