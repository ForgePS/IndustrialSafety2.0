# S2F-5 CAD Conflicts — Parity Matrix

| Concern                    | Legacy                                   | FX              | Result |
| -------------------------- | ---------------------------------------- | --------------- | ------ |
| List endpoint              | `GET …/cad/conflicts?status=OPEN`        | Same            | Pass   |
| Resolve endpoint + payload | Same POST body                           | Same            | Pass   |
| Columns                    | Type, Severity, Field, Incident, Actions | Same            | Pass   |
| Type / severity labels     | Raw API strings                          | Raw API strings | Pass   |
| Incident link              | Truncated id → `/incidents/{id}/`        | Same            | Pass   |
| Actions                    | KEEP_FORGE / USE_CAD / ESCALATE          | Same            | Pass   |
| Search/filter/sort/page    | None (OPEN hard-coded)                   | None            | Pass   |
| Detail view                | None                                     | None            | Pass   |
| Empty / error / loading    | Present                                  | Present         | Pass   |
| Feature gate               | `cadEnabled`                             | Same            | Pass   |
