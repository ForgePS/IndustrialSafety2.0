# S2F-6 NERIS Configuration — Permission Map

| Concern      | Mechanism                                       |
| ------------ | ----------------------------------------------- |
| Route / page | `FeatureGate` `tenantConfiguration`             |
| Nav item     | NERIS Configuration nav + `tenantConfiguration` |
| Data / saves | Backend tenant-scoped NERIS configuration APIs  |

FX module flag does **not** grant configuration access, alter auth, or change authorization.
