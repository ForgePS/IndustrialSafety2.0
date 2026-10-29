# S2F-2 Incident Review — Parity Matrix

| Concern                | Legacy                          | FX                    | Result |
| ---------------------- | ------------------------------- | --------------------- | ------ |
| Queue columns          | Number, Status, Date, Review    | Same                  | Pass   |
| Queue filter           | `REVIEW_STATUSES` client filter | Same                  | Pass   |
| Deep link              | `?section=REVIEW`               | Same                  | Pass   |
| `submitForReview` args | note optional                   | Same                  | Pass   |
| `returnIncident` args  | reason + `[]`                   | Same                  | Pass   |
| `approveIncident`      | tenant + id                     | Same                  | Pass   |
| `addReviewComment`     | body trim                       | Same                  | Pass   |
| Validation findings    | severity + message              | Same text via summary | Pass   |
| Specialty panel        | Legacy markup                   | Legacy (compat)       | Pass   |

No unexplained payload differences.
