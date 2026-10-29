# S2F-3 CAD Messages — Permission Map

| Concern      | Mechanism                                         |
| ------------ | ------------------------------------------------- |
| Route / page | `FeatureGate` `cadOperations`                     |
| Nav item     | `RMS_FEATURE_FLAGS.cadOperations` in nav registry |
| Data         | Backend tenant-scoped `listCadMessages`           |

FX module flag does **not** grant CAD access.
