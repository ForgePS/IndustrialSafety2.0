# 60 — Performance (Forms & Tables)

**Date:** 2026-07-30

| Technique          | Notes                                              |
| ------------------ | -------------------------------------------------- |
| Error isolation    | Form/table section boundaries                      |
| Virtual windowing  | `FxVirtualTable` slices loaded rows (no new fetch) |
| Lazy chrome        | Flags load independently; legacy path when off     |
| Avoid full remount | Domain fetch callbacks unchanged                   |

No polling introduced. No backend changes.
