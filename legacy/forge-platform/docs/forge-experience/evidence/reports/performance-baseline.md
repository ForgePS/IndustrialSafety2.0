# Performance Baseline — FX-S1.5

**Document:** `docs/forge-experience/evidence/reports/performance-baseline.md`  
**Date:** 2026-07-30  
**Build:** `pnpm --filter @forge/forge-experience-reference build` (Next.js 15.5.21)  
**Status:** BASELINE RECORDED — no optimization work required (no critical issues)

## Bundle size (production build)

| Route           | Page size | First Load JS |
| --------------- | --------- | ------------- |
| `/` (dashboard) | 1.28 kB   | 109 kB        |
| `/forms`        | 1.35 kB   | 109 kB        |
| `/patterns`     | 965 B     | 109 kB        |
| `/playground`   | 1.31 kB   | 109 kB        |
| `/validation`   | 1.48 kB   | 109 kB        |
| `/workspace`    | 1.77 kB   | 109 kB        |
| Shared JS       | —         | 102 kB        |

Shared chunks: framework ~54 kB + app ~46 kB + other ~2 kB.

## Runtime timings (reference app, local)

Measured via Navigation Timing / Paint Timing on dashboard load (dev session; absolute numbers are environment-sensitive):

| Metric                 | Value (ms) | Notes                         |
| ---------------------- | ---------- | ----------------------------- |
| `responseEnd`          | ~6620      | Local host; cold/dev inflated |
| `domContentLoaded`     | ~6720      | Local host                    |
| `load`                 | ~7210      | Local host                    |
| First Contentful Paint | ~6764      | Local host                    |

**Interpretation:** First Load JS ~109 kB is acceptable for RC1 reference. Production product apps should re-baseline under their CDN and auth shells. No critical FX package issue identified.

## Component / feature notes

| Area                  | Observation                                                 |
| --------------------- | ----------------------------------------------------------- |
| Initial render        | Static generation; dashboard widgets are client-light SVG   |
| Route transitions     | App Router client nav; no measured regressions              |
| Large table rendering | Reference tables are small; virtual scroll not in RC1 scope |
| Virtual scrolling     | Not implemented — tracked as known limitation               |
| Dashboard widgets     | SVG charts + map render synchronously with synthetic data   |
| Bundle size           | See table above                                             |

## Issues

| ID    | Severity | Description                                  | Status           |
| ----- | -------- | -------------------------------------------- | ---------------- |
| P-001 | Info     | No virtualized table yet for 1k+ rows        | Accepted for RC1 |
| P-002 | Info     | Dev-server timing not comparable to CDN prod | Accepted         |

No critical performance defects. Optimization deferred.
