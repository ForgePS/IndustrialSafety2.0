# Platform Analytics (MK-S20)

## Scope

Creator Console **SaaS platform analytics only**.

Does **not**:

- Replace industrial / product analytics (`industrial-analytics`, industrial dashboard)
- Expose tenant PII (emails, persons, audit before/after payloads)
- Deploy or migrate production

## API

```http
GET /api/v1/platform/analytics/overview
Permission: platform.analytics.read  (creator-only)
```

Returns aggregates:

- tenants (total + by status, active/trial/suspended)
- users (membership totals / active / suspended)
- products (catalog active + active tenant assignments)
- module adoption (top modules by distinct tenants)
- onboarding (in progress / completed / failed)
- billing (subscriptions by status, active-like, trial)
- recentActivity (action / resourceType / result / tenantKey only)

## Privacy

- Cross-tenant reads use transaction-local `app.bypass_rls=on` via `withBypassRlsTransaction`
- Migration `0037` extends SELECT/ALL policies on aggregate tables to honor bypass
- Callers must authorize `platform.analytics.read` before enabling bypass
- Recent activity joins `tenants.tenant_key` only — never emails or JSON payloads

## UI

- Overview (`/`) consumes platform analytics when permitted
- Dedicated `/analytics` page (Creator Console nav)
- Tenant Admin / industrial surfaces unchanged

## Migration

`0037_mk_s20_platform_analytics.sql` — **not applied to production**
