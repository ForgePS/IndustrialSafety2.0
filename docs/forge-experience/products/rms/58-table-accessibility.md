# 58 — Table Accessibility

**Date:** 2026-07-30 · **Target:** WCAG 2.2 AA

| Area      | Behavior                                      |
| --------- | --------------------------------------------- |
| Headers   | `scope="col"`                                 |
| Caption   | Required on `FxTable`                         |
| Sort      | `aria-sort` + announced button labels         |
| Selection | Checkbox labels; selection status live region |
| Loading   | `role="status"`                               |
| Errors    | `role="alert"` via table boundary             |
| Overflow  | Horizontal scroll container on small screens  |

Manual matrix under `65-evidence.md`.
