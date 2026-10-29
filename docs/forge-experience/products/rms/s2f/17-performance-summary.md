# 17 — Performance Summary (S2F-8)

**Date:** 2026-07-31  
**Status:** Documented methodology only — **no laboratory timings claimed**

## Design expectations (not measured)

| Concern                 | Expected impact                                     | Evidence type              |
| ----------------------- | --------------------------------------------------- | -------------------------- |
| Flag resolution         | Negligible (in-memory resolvers)                    | Unit tests; sync `useMemo` |
| Dual presentation trees | Only one branch renders per surface                 | Code inspection            |
| List fetches            | Same full-list patterns as legacy                   | Parity matrices            |
| Bundle                  | FX UI imported behind flags/routes; legacy retained | Architecture               |

## Measurements not collected in S2F-8

| Metric                               | Status       |
| ------------------------------------ | ------------ |
| Initial render (FX vs legacy)        | Not measured |
| Route transition timings             | Not measured |
| Table / form / dialog render timings | Not measured |
| Save operation timings               | Not measured |
| Memory / bundle delta                | Not measured |

## Certification statement

No unsupported performance claims are made. Pilot should capture Lighthouse / Web Vitals on representative routes with flags off vs on and attach results to evidence before GA.
