# 55 — Filter Framework

**Date:** 2026-07-30

| Control       | Implementation                                       |
| ------------- | ---------------------------------------------------- |
| Search        | Existing `ListControlsView` / `FxSearch`             |
| Sort UI       | Existing list controls + optional column `aria-sort` |
| Filter select | `FxFilter` + ListControls filter props               |
| Saved filters | Hook only — not wired (no backend)                   |

Only filters backed by current RMS behavior are exposed on migrated tables.
