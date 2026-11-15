# MK-S20 Plan — Platform Analytics

## Objective

Add Creator Console–only SaaS platform analytics (aggregate KPIs). Do not replace product-specific analytics (industrial/RMS). Respect tenant privacy (counts and codes only; no emails/PII payloads). No production ops.

## Changes

1. Contracts `platform-analytics-domain` + permission `platform.analytics.read`
2. Nest `PlatformAnalyticsModule`: `GET /api/v1/platform/analytics/overview`
3. Metrics: tenants by status, users/active users, products, module adoption, onboarding, billing/subscriptions, recent activity (redacted)
4. EXTEND Creator Console Overview to consume the overview API
5. Docs `PLATFORM_ANALYTICS.md`
6. Migration `0037` permission seed (not applied prod)

## Out of scope

- Industrial analytics / `industrial-analytics.ts`
- Tenant Admin analytics productization
- Time-series warehouse / BI tooling
- Production migrate/deploy
