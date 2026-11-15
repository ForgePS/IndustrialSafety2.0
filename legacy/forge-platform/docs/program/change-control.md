# Program Change Control

**Program:** Forge Public Safety AWS Platform Rebuild  
**Effective:** 2026-07-31 (DR-1)  
**Applies to:** Master Directive revisions, governing program docs, architecture exceptions that change standing policy

## Principle

**No silent edits.** Governing specifications change only through proposal → impact → review → approval → version → traceability.

## When change control is required

| Change type                                         | Required?                                                      |
| --------------------------------------------------- | -------------------------------------------------------------- |
| Edit Master Directive content or interpretation     | Yes                                                            |
| Change §42 phase definitions or order               | Yes                                                            |
| Approve / revoke architecture exceptions            | Yes (Architecture Owner + Program Owner for standing policy)   |
| Rewrite roadmap phase model                         | Yes                                                            |
| Update project-status facts only (no policy change) | No — date the revision                                         |
| Sprint summaries / evidence append-only             | No                                                             |
| Application code / infra / flags                    | Out of scope of this doc — separate engineering change control |

## Process

### 1. Proposal

Record in `decision-log.md` (draft) or a short proposal note:

- What changes
- Why
- Directive sections affected

### 2. Impact analysis

Must address:

- Phases (§42)
- Gaps (`directive-gap-register.md`)
- Exceptions (`architecture-exceptions.md`)
- Products (Academy / RMS / Platform / Industrial)
- Dual-stack / Firebase constraints
- Pilot / GA / feature-flag implications

### 3. Architecture review

Required when any of the following are affected:

- Tenancy / RLS / AuthN / AuthZ
- Data model / migrations
- API surface boundaries
- AWS account / partition / GovCloud
- Consolidation or split of services

### 4. Approval

| Artifact                                      | Approver                                                |
| --------------------------------------------- | ------------------------------------------------------- |
| Master Directive revision                     | Program Owner                                           |
| Architecture exception disposition            | Architecture Owner (+ Program Owner if standing policy) |
| Phase reorder / skip                          | Program Owner                                           |
| Roadmap / status alignment to approved policy | Engineering Lead                                        |

### 5. Version increment

- Update `directive-version.md` (MD-x.y) for directive changes
- Record decision in `decision-log.md`
- Update `program-dashboard.md`

### 6. Traceability update

Mandatory updates after approval:

- `directive-traceability-matrix.md`
- `directive-phase-mapping.md`
- `directive-compliance-matrix.md` (if status shifts)
- `docs/project-status.md`
- `docs/technical-roadmap.md` (if phase content shifts)

## Forbidden

- Quietly editing `Master Directive.pdf` without version bump
- Reintroducing legacy 1–17 phase numbering as governing IDs
- Implementing product work that contradicts unresolved REJECTED exceptions
- Treating Cursor mission text as higher than the Master Directive

## Emergency clarifications

If a Cursor directive conflicts with the Master Directive:

1. Stop implementation of the conflicting portion.
2. Log the conflict in `decision-log.md`.
3. Escalate to Program Owner.
4. Master Directive wins unless an approved exception exists.
