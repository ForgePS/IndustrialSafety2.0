# MK-S11 Plan — Creator Console

## Objective

Shape Creator Console as the Forge SaaS control plane: required nav, tenant-detail sections, and page-level permission gates. Server API authorization remains authoritative.

## Changes

1. Reorganize `CREATOR_NAV_GROUPS` to primary control-plane labels with `permission` metadata.
2. Add `/modules`, `/plans`, `/contracts`, `/system` pages.
3. `GET /api/v1/platform/plans` for plan catalog.
4. Extend tenant-detail with required section anchors/panels.
5. Shared `PlatformPageGate` on primary pages.

## Out of scope

- Visual redesign / Makerkit clone
- MK-S12 Tenant Admin
- Production ops
- Studio/NERIS/AI rewrite (demote to secondary nav)
