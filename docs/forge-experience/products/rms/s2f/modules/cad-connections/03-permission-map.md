# S2F-4 CAD Connections — Permission Map

| Concern          | Mechanism                                   |
| ---------------- | ------------------------------------------- |
| Route / page     | `FeatureGate` `cadEnabled`                  |
| Nav item         | Existing CAD connections nav + `cadEnabled` |
| Data / mutations | Backend tenant-scoped CAD connection APIs   |

FX module flag does **not** grant CAD access, alter auth, or change authorization.
