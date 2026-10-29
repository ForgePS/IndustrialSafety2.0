# 07 — Rollback Plan (GA)

**Status:** **DRAFT**

## Per-tenant module rollback

```http
DELETE /api/v1/tenants/{tenantId}/features/{featureKey}
```

Effect: that tenant’s surface returns to legacy; other tenants unchanged. Target &lt; 5 minutes.

## Cohort / emergency

1. List all tenants with `fx.rms.*` overrides (Creator Console / audit).
2. Delete overrides for affected keys.
3. If Strategy B/C defaults were flipped: restore `feature_definitions.default_value_json` to `false` for affected keys (requires `platform.feature.manage` / controlled change).
4. Verify sample tenants render legacy.
5. Communicate status.

## Verification

| Check                        | Pass |
| ---------------------------- | ---- |
| Legacy UI restored           | Yes  |
| Sessions intact              | Yes  |
| APIs unaffected              | Yes  |
| Non-target tenants unchanged | Yes  |

Live drill must be proven in pilot (`../pilot/10-rollback-validation.md`) before GA.
