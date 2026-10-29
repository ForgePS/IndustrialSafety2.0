# 29 — Dashboard Layout Specification

**Date:** 2026-07-30

## Grid

12-column responsive CSS grid (`DashboardGrid`).

## Sizes

| Size | Columns | Row height factor |
| ---- | ------- | ----------------- |
| 1x1  | 3       | 1                 |
| 2x1  | 6       | 1                 |
| 2x2  | 6       | 2                 |
| 3x2  | 9       | 2                 |
| 4x2  | 12      | 2                 |

≤1023px: spans collapse toward full width. ≤599px: single column.

## Personalization (local)

`localStorage` key `fx.rms.dashboard.preferences.v1` stores order, visibility, size. No backend persistence yet. Reset layout clears preferences.
