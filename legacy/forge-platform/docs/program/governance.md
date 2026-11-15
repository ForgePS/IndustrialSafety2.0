# Forge Platform Program Governance

**Program:** Forge Public Safety AWS Platform Rebuild  
**Phase:** DR-1 — Master Directive Adoption & Governance  
**Effective:** 2026-07-31  
**Status:** ACTIVE

## Source of Truth statement

The authoritative specification for this program is:

**`Master Directive.pdf`** (repository root)  
_FORGE PUBLIC SAFETY AWS PLATFORM REBUILD — MASTER CURSOR DEVELOPMENT DIRECTIVE_

No roadmap, status report, Cursor directive, sprint plan, or architecture note may contradict the Master Directive unless an **approved architecture exception** or **approved directive revision** is recorded under `docs/program/`.

Implementation phase numbering follows **Master Directive §42** exclusively.

## Document hierarchy (precedence)

Higher documents govern lower documents. No lower document may override a higher document.

| Rank | Class                               | Examples                                                                             |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| 1    | **Master Directive**                | `Master Directive.pdf`                                                               |
| 2    | **Approved Architecture Decisions** | `docs/architecture/adr/*`, `docs/program/architecture-exceptions.md` (approved rows) |
| 3    | **Accepted Phase Deliverables**     | Acceptance reports, release acceptances                                              |
| 4    | **Implementation Plans**            | Sprint plans, phase plans                                                            |
| 5    | **Cursor Development Directives**   | Authorized Cursor mission packets                                                    |
| 6    | **Roadmaps**                        | `docs/technical-roadmap.md` (must align to §42)                                      |
| 7    | **Project Status Reports**          | `docs/project-status.md`, `docs/program/program-dashboard.md`                        |
| 8    | **Historical Documents**            | Superseded roadmaps, archived summaries                                              |

## Directive ownership

| Role                                      | Responsibility                                        |
| ----------------------------------------- | ----------------------------------------------------- |
| Program Owner                             | Master Directive content ownership; revision approval |
| Architecture Owner                        | ADRs and architecture exceptions                      |
| Engineering Lead                          | Phase mapping, evidence, implementation status        |
| Product Owners (Academy / RMS / Platform) | Product scope vs §19 / §20 / shared engines           |
| Security Owner                            | §31–§40 compliance artifacts                          |

## Change approval process

Directive and governance changes follow `docs/program/change-control.md`.

Summary:

1. **Proposal** — written change request
2. **Impact analysis** — phases, gaps, exceptions, products
3. **Architecture review** — if structure, tenancy, security, or data model affected
4. **Approval** — Program Owner (directive) / Architecture Owner (exceptions)
5. **Version increment** — update `directive-version.md`
6. **Traceability update** — matrix, phase mapping, dashboard

**No silent edits** to the Master Directive or to governing program docs.

## Versioning policy

| Artifact                | Versioning                                                       |
| ----------------------- | ---------------------------------------------------------------- |
| Master Directive        | Semantic program version in `directive-version.md` (e.g. MD-1.0) |
| Architecture exceptions | Exception ID + disposition history                               |
| ADRs                    | ADR-NNN; immutable once accepted (supersede via new ADR)         |
| Roadmaps / status       | Dated revisions; obsolete numbering archived                     |

## Architecture approval workflow

1. Identify deviation from Master Directive (or proposed new pattern).
2. Open / update row in `architecture-exceptions.md` (or draft ADR).
3. Architecture Owner reviews risk, alternative, and exit criteria.
4. Disposition: **APPROVED EXCEPTION** | **REJECTED** | **TEMPORARY** | **RESOLVED**.
5. Link exception ID in roadmap, status, and traceability rows.
6. Temporary exceptions require an expiry or next-review date.

Undocumented deviations are **not allowed**.

## Phase approval workflow

Phases use Master Directive **§42** IDs: **0, 1, 2, 3, 4, 5, 5A, 6, 7, 8, 9, 10, 11, 12**.

1. Phase work requires an authorized Cursor directive or explicit program authorization.
2. Delivery evidence is recorded against the §42 phase in `directive-phase-mapping.md`.
3. Acceptance is recorded only against the §42 phase (product sub-tracks may nest under it).
4. Reordering or skipping §42 phases requires an **approved architecture exception**.
5. Hard stops (no Firebase deletion, no unauthorized GA/flags/GovCloud/Academy expansion) remain in force until lifted by Program Owner.

## Related DR-1 artifacts

- [directive-version.md](./directive-version.md)
- [change-control.md](./change-control.md)
- [decision-log.md](./decision-log.md)
- [architecture-exceptions.md](./architecture-exceptions.md)
- [directive-traceability-matrix.md](./directive-traceability-matrix.md)
- [directive-phase-mapping.md](./directive-phase-mapping.md)
- [program-dashboard.md](./program-dashboard.md)
- [superseded-documents.md](./superseded-documents.md)

## Hard stops (governance)

- No production functionality changes under DR-1
- No feature-flag enablement by governance docs alone
- No deployment authorization implied by DR-1 completion
- Firebase deletion forbidden until AWS replacements accepted
