# S2F-7 Administration & Utilities — Permission Map

| Route             | Gate / auth                                                  |
| ----------------- | ------------------------------------------------------------ |
| `/select-tenant/` | Authenticated session (`useAuth`); no product FeatureGate    |
| `/health/`        | Public ops probe page (no FeatureGate); same fetch as legacy |
| `/login/`         | Deferred — existing auth flows unchanged                     |

FX module flags do **not** grant admin rights, alter RBAC, or change tenant resolution.
Backend / web-kit auth remains authoritative for `chooseTenant`.
