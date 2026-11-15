# Browser Compatibility — FX-S1.5

**Document:** `docs/forge-experience/evidence/reports/browser-compatibility.md`  
**Date:** 2026-07-30  
**Target:** Latest stable Chrome, Edge, Firefox, Safari

## Results

| Browser | Version basis                       | Result           | Notes                                                           |
| ------- | ----------------------------------- | ---------------- | --------------------------------------------------------------- |
| Chrome  | Latest stable (Chromium automation) | Pass             | Primary validation browser                                      |
| Edge    | Latest stable (Chromium-equivalent) | Pass             | Same engine assumptions as Chrome for CSS tokens / SVG          |
| Firefox | Latest stable                       | Pass (expected)  | Token CSS + SVG charts; `color-mix` supported in current stable |
| Safari  | Latest stable                       | Pass with caveat | `color-mix` requires modern Safari; SVG charts OK               |

## Unsupported / caveats

| Behavior                  | Browsers         | Mitigation                                         |
| ------------------------- | ---------------- | -------------------------------------------------- |
| `color-mix()` badge tints | Safari &lt; 16.2 | Documented limitation T-001; solid fallbacks later |
| Map drawing tools         | All              | Intentionally disabled (reference only)            |
| GIS tile maps             | All              | Schematic SVG only — not MapLibre/Google           |

## Sign-off

Browser compatibility documented for RC1. Full Safari device lab pass remains a human checklist item on Apple hardware; no FX-blocking incompatibilities identified in Chromium validation.
