# S2F-1 Incidents — Parity Matrix

| Concern                   | Legacy                                  | FX (module+foundation)       | Result        |
| ------------------------- | --------------------------------------- | ---------------------------- | ------------- |
| List columns              | Number, Status, Date, Description, Open | Same                         | Pass          |
| List search/page          | ListControlsView + listIncidents        | Same controls + FxTable body | Pass          |
| List sort API             | Sort UI not applied to API              | Same                         | Pass (parity) |
| Create payload            | `createIncident` fields                 | Same handler                 | Pass          |
| Workspace sections        | `?section=`                             | Same                         | Pass          |
| Autosave keys             | `rms-autosave:…`                        | Same                         | Pass          |
| FieldRenderer             | Local CSS                               | Unchanged when FX workspace  | Pass (compat) |
| CAD / NERIS / attachments | Existing panels                         | Same children                | Pass          |

Payload method/endpoint/body: unchanged (presentation-only branch).
