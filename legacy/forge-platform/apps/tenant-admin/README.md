# @forge/tenant-admin

Status: **ACTIVE** — customer tenant administration (MK-S12).

Static-export Next.js app (port 3004) for tenant administrators:

- Administration: Overview, Organization, Facilities, Members, Invitations, Roles, Permissions, Products, Modules, Billing, Branding, Security, Notifications, Integrations, API, Audit
- Configuration Studio (delegated namespaces)
- Import Center

```bash
pnpm --filter @forge/tenant-admin dev
```

Client `TenantPageGate` filters UX; API `RequirePermission` remains authoritative.
