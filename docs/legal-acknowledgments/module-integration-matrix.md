# Transaction attestation — module integration matrix

| Module | Candidate Action | Attestation Needed | Implemented |
| --- | --- | --- | --- |
| Personnel | Policy acknowledgment | Yes | No |
| Orientation | Completion | Yes | No |
| Training | Course completion | Yes | **Yes (S1)** |
| LOTO | Authorization/approval | Yes | No |
| JSA | Employee acknowledgment | Yes | No |
| Incidents | Final certification | Yes | No |
| Inspections | Completion | Yes | No |
| Corrective Actions | Closure | Yes | No |
| Workers Comp | Selected certification | Evaluate | No |
| Fleet | Vehicle inspection | Yes | No |
| DOT | Selected records | Evaluate | No |
| Hot Work | Permit authorization | Yes | No |
| Confined Space | Permit authorization | Yes | No |

Do not apply attestations to all database writes. Integrate per-workflow via `AttestationService`.
