# S2F-2 Incident Review — Permission Map

| Concern                             | Mechanism                                  |
| ----------------------------------- | ------------------------------------------ |
| Queue route                         | `FeatureGate` `officerReview`              |
| Nav item                            | `rms.neris.incident.review` (nav registry) |
| Submit / comment / return / approve | Existing `hasPermission` checks in panel   |
| Direct URL                          | Backend authoritative                      |

FX module flag does not grant access.
