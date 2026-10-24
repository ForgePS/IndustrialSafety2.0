# S2F-5 CAD Conflicts — Permission Map

| Concern        | Mechanism                                 |
| -------------- | ----------------------------------------- |
| Route / page   | `FeatureGate` `cadEnabled`                |
| Nav item       | Existing CAD Conflicts nav + `cadEnabled` |
| Data / resolve | Backend tenant-scoped CAD conflict APIs   |

FX module flag does **not** grant CAD access, alter auth, or change authorization.
