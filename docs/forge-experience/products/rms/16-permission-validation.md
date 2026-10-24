# Permission Validation — RMS FX Shell (S2B)

**Document:** `16-permission-validation.md`  
**Updated:** 2026-07-30

## Principle

Navigation hiding is not authorization. Backend `@RequirePermission` remains authoritative.

## Soft-auth routes

| Route             | Anonymous          | Authenticated            | FX shell behavior                     |
| ----------------- | ------------------ | ------------------------ | ------------------------------------- |
| `/`               | Allowed            | Allowed                  | No tenant leak when signed out        |
| `/login/`         | Allowed            | Allowed                  | Session shows Sign in when logged out |
| `/auth/callback/` | OAuth              | OAuth                    | Outside primary nav                   |
| `/health/`        | Allowed            | Allowed                  | Outside primary nav                   |
| `/select-tenant/` | Soft               | Required for tenant work | Link when authenticated               |
| Feature pages     | Soft + FeatureGate | FeatureGate              | Unchanged                             |

## Nav visibility evaluation order

1. Auth state (session links)
2. Product feature flag (`RMS_FEATURE_FLAGS`)
3. FX presentation flags (shell/nav)
4. Registry membership

Permission strings on registry items are documentation hints for future client filters — not client-side authZ.

## Direct URL

All 16 routes remain registered in Next.js. FX shell does not remove routes.
