# NERIS Phase 2 — Status and Roadmap

**Last updated:** 2026-07-26

## Phase summary

| Phase   | Name                              | Status                                                                           |
| ------- | --------------------------------- | -------------------------------------------------------------------------------- |
| Phase 1 | Schema Foundation                 | COMPLETE                                                                         |
| Phase 2 | Core Incident Shell + MANUAL_ONLY | COMPLETE — see [phase-2-completion-summary.md](../phase-2-completion-summary.md) |

## Phase 2 deliverables

| Wave | Deliverable                                    | Status                                     |
| ---- | ---------------------------------------------- | ------------------------------------------ |
| 0    | Contracts, permissions, flags, events          | DONE                                       |
| 1    | Migration 0009 + RMS master data APIs          | DONE                                       |
| 2    | Migration 0010 + state machine + numbering     | DONE                                       |
| 3    | Incident APIs, validation, prefill, duplicates | DONE                                       |
| 4    | `@forge/web-kit` + rms-web shell               | DONE                                       |
| 5    | Intake workspace + field renderer + autosave   | DONE                                       |
| 6    | Officer review + tenant configuration UI       | DONE                                       |
| 7    | Synthetic seed + test matrix + CI extensions   | DONE                                       |
| 8    | CDK RMS hosting + docs + ADRs 031–035          | DONE (development AWS verified 2026-07-26) |

## Documentation index (§22)

| Doc                    | Path                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| Architecture overview  | [overview.md](../architecture/overview.md)                                                      |
| Incident shell         | [incident-shell.md](../architecture/incident-shell.md)                                          |
| Master data            | [master-data.md](../architecture/master-data.md)                                                |
| Form rendering         | [form-rendering.md](../architecture/form-rendering.md)                                          |
| Incidents API          | [incidents.md](../api/incidents.md)                                                             |
| Master data API        | [master-data.md](../api/master-data.md)                                                         |
| Deployment             | [deployment.md](../operations/deployment.md)                                                    |
| Feature flags          | [feature-flags.md](../operations/feature-flags.md)                                              |
| Test matrix            | [test-matrix.md](../testing/test-matrix.md)                                                     |
| Warning classification | [phase-1-import-warning-classification.md](../testing/phase-1-import-warning-classification.md) |
| Tenant configuration   | [tenant-overlays.md](../configuration/tenant-overlays.md)                                       |
| Manual intake          | [manual-intake-workflow.md](../intake/manual-intake-workflow.md)                                |
| Autosave / concurrency | [autosave-and-concurrency.md](../intake/autosave-and-concurrency.md)                            |
| Officer review         | [officer-review-workflow.md](../review/officer-review-workflow.md)                              |

Completion report template: [phase-2-completion-summary.md](../phase-2-completion-summary.md).

## Explicit deferrals (still deferred after Phase 2)

- Creator Console → `@forge/web-kit` consolidation
- CAD adapters, CAD UI, CAD credentials
- NERIS external / state submission
- Offline sync

## Next

**Phase 3** (authorized): dynamic fire and specialty incident workflows — see [phase-3-status.md](./phase-3-status.md) and [specialty-workflows.md](../architecture/specialty-workflows.md).

Still separately authorized: CAD, external NERIS submission, offline sync, AI narrative, ePCR, IRWIN transmission, SOC 2 Type 1/2, production customer onboarding.

See also: [technical roadmap](../../technical-roadmap.md), [project status](../../project-status.md).
