# S2F-4 CAD Connections — Parity Matrix

| Concern                           | Legacy                                   | FX              | Result |
| --------------------------------- | ---------------------------------------- | --------------- | ------ |
| List endpoint                     | `GET …/cad/connections`                  | Same            | Pass   |
| Create endpoint + payload         | Fixed synthetic webhook POST             | Same            | Pass   |
| Enable / disable / test           | Same POSTs                               | Same            | Pass   |
| Columns                           | Name, Public ID, Status, Health, Actions | Same            | Pass   |
| Status / health labels            | Raw API strings                          | Raw API strings | Pass   |
| Secrets displayed                 | Never                                    | Never           | Pass   |
| Name field only on create         | Yes                                      | Yes             | Pass   |
| Archive / delete                  | None                                     | None            | Pass   |
| Edit form                         | None                                     | None            | Pass   |
| Empty / error / loading / success | Present                                  | Present         | Pass   |
| Feature gate                      | `cadEnabled`                             | Same            | Pass   |
