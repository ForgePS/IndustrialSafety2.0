# S2F-6 NERIS Configuration — Parity Matrix

| Concern                            | Legacy                                       | FX      | Result |
| ---------------------------------- | -------------------------------------------- | ------- | ------ |
| Load                               | GET configuration + field-overlays           | Same    | Pass   |
| Operating mode save                | PUT `{ operatingMode: MANUAL_ONLY, status }` | Same    | Pass   |
| Overlay save                       | PUT field overlay fields                     | Same    | Pass   |
| Labels / help / order / favorite   | Same fields                                  | Same    | Pass   |
| Official codes editable            | No                                           | No      | Pass   |
| Cancel / reset                     | None                                         | None    | Pass   |
| Org/agency/export/defaults editors | None                                         | None    | Pass   |
| Feature gate                       | `tenantConfiguration`                        | Same    | Pass   |
| Empty / error / loading / success  | Present                                      | Present | Pass   |
