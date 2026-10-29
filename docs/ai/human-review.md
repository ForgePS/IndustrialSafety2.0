# AI Narrative — Human Review

**Invariant:** No draft becomes record content without an explicit human accept (full or partial).

## Lifecycle

| Status                                                              | Meaning                                            |
| ------------------------------------------------------------------- | -------------------------------------------------- |
| PENDING → VALIDATING → REDACTING → GENERATING → VALIDATING_RESPONSE | Pipeline                                           |
| READY_FOR_REVIEW                                                    | Draft available; labeled `AI DRAFT — NOT REVIEWED` |
| ACCEPTED                                                            | Human accepted (full or partial)                   |
| REJECTED                                                            | Human rejected with reason                         |
| FAILED / CANCELLED / EXPIRED                                        | Terminal non-accept paths                          |

## Review actions

| Action         | Route                                           | Permission                                |
| -------------- | ----------------------------------------------- | ----------------------------------------- |
| Accept all     | `POST .../narratives/:requestId/accept`         | `ai.narrative.accept` (or product accept) |
| Partial accept | `POST .../narratives/:requestId/partial-accept` | same as accept                            |
| Reject         | `POST .../narratives/:requestId/reject`         | `ai.narrative.reject`                     |
| Regenerate     | `POST .../narratives/:requestId/regenerate`     | generate or rewrite                       |
| History        | `GET .../narratives/:requestId/history`         | `ai.narrative.use`                        |

Accept body selects draft id, mode (`ACCEPT_ALL` / `PARTIAL`), optional sections, and optional insert-into-record. Reject requires a reason.

## What humans must verify

- Facts match source fields; no invented details.
- Missing-information and conflict warnings from structured output.
- Quality checks (chronological, clear, professional, facts-only) are advisory only.
- Tone and detail level are appropriate for the record type.

## Explicit non-goals

- Auto-finalize of incidents or investigations
- Auto NERIS submission
- Auto ePCR submission
- Silent overwrite of existing narrative without accept

After accept, UI should show `AI-ASSISTED — HUMAN REVIEWED` where the product surfaces draft provenance.
