# Tenant Admin User Guide

Tenant Admin is the delegated administration center for customer tenants.

## Scope

Delegated Configuration Studio modules only:

- Tenant / Organization Profile
- Branding, Navigation, Terminology, Dropdowns
- Notification / Email templates
- Business Hours, Holiday Calendar
- Facilities, Locations
- Roles

Creator-only modules (security platform defaults, module/feature managers, reporting engines, etc.) are not exposed.

## Hosting note

Application code lives in `apps/tenant-admin`. Development CloudFront hosting for Tenant Admin may still be missing — run locally (`pnpm --filter @forge/tenant-admin dev`) until frontend stack exports are added.
