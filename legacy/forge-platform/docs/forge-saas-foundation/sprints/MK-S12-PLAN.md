# MK-S12 Plan — Tenant Administration

## Objective

Extend Tenant Admin into the customer-facing admin surface with the required sections and page-level permission gates. API `RequirePermission` remains authoritative. Configuration Studio stays reusable secondary surface — no redesign.

## Required sections

Overview, Organization, Facilities, Members, Invitations, Roles, Permissions, Products, Modules, Billing, Branding, Security, Notifications, Integrations, API, Audit.

## Changes

1. Reorganize `TENANT_ADMIN_NAV_GROUPS` with `permission` / `anyOfPermissions`.
2. Add `TenantPageGate` (mirror Creator `PlatformPageGate`).
3. Add/extend section pages; reuse Studio routes for Organization/Branding/Notifications where appropriate; SQL facilities API for Facilities.
4. Overview dashboard with session-scoped counts/links.
5. Port needed membership/invitation helpers into Tenant Admin `api.ts`.

## Out of scope

- Studio redesign
- MK-S13+ (notifications service, storage, API keys productization beyond stubs)
- Production ops / Creator changes
