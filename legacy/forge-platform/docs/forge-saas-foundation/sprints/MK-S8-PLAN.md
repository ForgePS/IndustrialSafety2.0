# MK-S8 Plan — Forge SaaS Application Shell

## Objective

Deliver a premium common application-shell capability set on Forge + Sneat tracks: chrome affordances and shell states, without redesigning operational modules (BACKLOG-009).

## Current State

- `@forge/ui` `ForgeAppShell` already has responsive sidebar + mobile drawer, topbar, breadcrumbs, page header, tenant/product switchers, notification stub, user menu.
- Creator wires tenant switcher + notifications; Tenant Admin lacks switcher/UI profile.
- Industrial uses Sneat `IndustrialShell` with tenant switch, theme, profile/settings.
- Nav entitlement filtering via `filterNavigationForSession` (MK-S5) exists but Creator/TA still call `filterNavigationGroups` without modules.

## Reuse

- ForgeAppShell / ForgeChrome / design-system nav / web-kit `switchActiveTenant` / `filterNavigationForSession`
- Industrial Sneat chrome patterns for loading / unauthorized / disabled entitlement gates

## Changes Required

1. `@forge/ui`: facility selector, search trigger, help control, richer profile menu links, `ForgeShellState` (loading/empty/error/unauthorized/disabled entitlement).
2. Creator + Tenant Admin: compose chrome parity; profile page; tenant switcher on TA; session nav filter with modules.
3. Industrial: add search/help/settings/facility chrome stubs in Sneat navbar (preserve layout).
4. Docs: `SHELL.md`; resolve BACKLOG-009 acceptance as multi-track behaviors.

## Out of Scope

- Makerkit clone / single unified visual redesign
- RMS FX restyle / force FX default-on
- Notification center wiring (BACKLOG-004 / 018)
- Full Creator→web-kit auth consolidation (BACKLOG-008)
- MK-S9+ billing
- Production ops

## Tests

- UI unit: shell state variants + chrome labels/aria
- Smoke: shells typecheck; profile routes exist

## PASS

Chrome components exist with required states; Creator/TA/Industrial expose tenant/product/facility/search/profile/help/settings affordances (stubs allowed); no operational module redesign.
