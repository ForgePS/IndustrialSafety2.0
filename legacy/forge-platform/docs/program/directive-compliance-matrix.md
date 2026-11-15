# Directive Compliance Matrix

**Audit lineage:** DR-0 (facts) → **DR-1** (governance adoption)  
**Date:** 2026-07-31  
**Authoritative source:** `Master Directive.pdf` (MD-1.0)  
**Phase model:** §42  
**Related:** `directive-traceability-matrix.md`, `architecture-exceptions.md`

Status values: COMPLETE · PARTIALLY_COMPLETE · NEEDS_VERIFICATION · NOT_STARTED · DEFERRED · SUPERSEDED · BLOCKED

## Phase scorecard (§42)

Scores are audit estimates (0–100). **Overall Status** is the governing label.

| §42 Phase           | Implementation % | Directive % | Evidence % | Acceptance % | Documentation % | Testing % | Overall Status        |
| ------------------- | ---------------- | ----------- | ---------- | ------------ | --------------- | --------- | --------------------- |
| 0 Discovery         | 95               | 95          | 90         | 90           | 95              | 80        | COMPLETE              |
| 1 Monorepo          | 95               | 95          | 95         | 95           | 90              | 90        | COMPLETE              |
| 2 AWS landing zone  | 85               | 80          | 90         | 85           | 85              | 80        | PARTIALLY_COMPLETE    |
| 3 Shared platform   | 70               | 65          | 85         | 80           | 75              | 75        | PARTIALLY_COMPLETE    |
| 4 Configuration     | 55               | 50          | 90         | 70           | 85              | 70        | PARTIALLY_COMPLETE    |
| 5 Import & Export   | 45               | 40          | 85         | 55           | 80              | 75        | PARTIALLY_COMPLETE    |
| 5A QR               | 0                | 0           | 0          | 0            | 5               | 0         | NOT_STARTED           |
| 6 Academy core      | 5                | 5           | 10         | 0            | 20              | 5         | NOT_STARTED           |
| 7 Academy advanced  | 0                | 0           | 0          | 0            | 10              | 0         | NOT_STARTED           |
| 8 Academy migration | 0                | 0           | 5          | 0            | 15              | 0         | NOT_STARTED           |
| 9 RMS core          | 25               | 25          | 80         | 60           | 75              | 70        | PARTIALLY_COMPLETE    |
| 10 RMS operations   | 20               | 20          | 75         | 55           | 70              | 65        | PARTIALLY_COMPLETE    |
| 11 Hardening        | 40               | 35          | 60         | 40           | 55              | 55        | PARTIALLY_COMPLETE    |
| 12 GovCloud         | 5                | 5           | 10         | 0            | 20              | 0         | NOT_STARTED           |
| **Program (§48)**   | **~30**          | **~30**     | **~70**    | **~45**      | **~65**         | **~55**   | **MAJOR GAPS REMAIN** |

### Score definitions

| Column           | Meaning                                                      |
| ---------------- | ------------------------------------------------------------ |
| Implementation % | Code/infra delivered vs phase intent                         |
| Directive %      | Requirement coverage vs Master Directive text for that phase |
| Evidence %       | Quality/availability of repos, logs, summaries               |
| Acceptance %     | Formal acceptance / DoD gate closure                         |
| Documentation %  | Required docs present and current                            |
| Testing %        | Automated/manual verification depth                          |

## Section matrix (§1–§48)

| Directive Section        | Requirement                    | Current Status     | Evidence             | Verification Required | Gap                    | Recommendation  | Priority | Estimated Effort |
| ------------------------ | ------------------------------ | ------------------ | -------------------- | --------------------- | ---------------------- | --------------- | -------- | ---------------- |
| §1 Primary               | Rebuild Academy+RMS on AWS     | PARTIALLY_COMPLETE | Platform + RMS slice | Parity                | GAP-ACA-01, GAP-RMS-01 | Continue phased | P0       | XXL              |
| §2 Discovery files       | Required discovery set         | PARTIALLY_COMPLETE | `docs/discovery/`    | Freshness             | —                      | Spot-check      | P2       | S                |
| §3 Monorepo structure    | Listed apps/packages           | PARTIALLY_COMPLETE | Monorepo; AX-API-01  | ADR follow-up         | AX-API-01              | Keep exception  | P0       | S                |
| §3 Tooling               | TS/Next/Nest/PG/pnpm/turbo/CDK | COMPLETE           | Repo tooling         | —                     | —                      | Maintain        | P3       | —                |
| §4 AWS org               | Full commercial org            | PARTIALLY_COMPLETE | Staged account       | —                     | AX-AWS-01              | Expand later    | P2       | L                |
| §4.2 GovCloud org        | Separate org                   | NOT_STARTED        | Stubs                | —                     | GAP-017                | Phase 12        | P2       | XXL              |
| §4.3 AWS services        | Service catalog                | PARTIALLY_COMPLETE | Core services        | Register              | GAP-AWS-SVC            | Fill register   | P2       | M                |
| §5 Partition-neutral     | No hard-coded ARNs             | PARTIALLY_COMPLETE | Env helpers          | Scan                  | —                      | Continuous      | P1       | M                |
| §6 Environments          | local→govcloud-prod            | PARTIALLY_COMPLETE | local/dev            | —                     | GAP-ENV                | Expand          | P2       | L                |
| §7 Data model doc        | Required path                  | NEEDS_VERIFICATION | Migrations exist     | Path                  | GAP-DM-01              | Align path      | P1       | S                |
| §7 Core tables           | Extensive list                 | PARTIALLY_COMPLETE | Drizzle migrations   | Diff                  | GAP-DM-02              | Build w/ phases | P1       | XL               |
| §8 Tenant isolation      | API+RLS+S3+jobs                | COMPLETE (tracks)  | ADR-012              | Continuous            | —                      | Maintain        | P0       | —                |
| §9 AuthN                 | Cognito MFA/SAML/OIDC          | PARTIALLY_COMPLETE | Cognito+invites      | —                     | GAP-ID-01              | Polish          | P2       | M                |
| §9 AuthZ                 | Rich permission catalog        | PARTIALLY_COMPLETE | authorization pkg    | Coverage              | GAP-PERM-01            | Expand          | P1       | L                |
| §10 Sensitive IDs        | Encrypted + reveal             | PARTIALLY_COMPLETE | ADR-018              | Reveal UX             | —                      | Verify          | P1       | M                |
| §11 Shared person        | Cross-product identity         | PARTIALLY_COMPLETE | Person APIs          | Sync                  | GAP-PERS-01            | With products   | P1       | L                |
| §12 Configuration Studio | Full studio                    | PARTIALLY_COMPLETE | Config acceptance    | Limitations           | AX-CFG-01              | Close gaps      | P1       | XL               |
| §13 Dropdowns            | Central system                 | PARTIALLY_COMPLETE | Config + fallbacks   | —                     | GAP-CFG-02             | Harden          | P2       | M                |
| §14 Custom fields        | Builder                        | PARTIALLY_COMPLETE | Foundation           | Entities              | GAP-CFG-CF             | Expand          | P2       | L                |
| §15 Form builder         | Drag-drop                      | PARTIALLY_COMPLETE | FX/forms partial     | DoD                   | GAP-CFG-FORM           | Sprint          | P1       | XL               |
| §16 Workflow builder     | No-code                        | NOT_STARTED        | —                    | —                     | GAP-CFG-WF             | After forms     | P2       | XL               |
| §17 Import Center        | Universal import               | PARTIALLY_COMPLETE | Import S1–S8         | Acceptance            | GAP-IMP-01             | Close gates     | P1       | M                |
| §17A QR                  | Shared QR                      | NOT_STARTED        | —                    | —                     | GAP-QR-01              | Authorize 5A    | P1       | XL               |
| §18 Export               | Shared export                  | NOT_STARTED        | —                    | —                     | GAP-EXP-01             | Phase 5         | P1       | XL               |
| §19 Academy              | Full product                   | NOT_STARTED        | Scaffold             | —                     | GAP-ACA-01             | Phases 6–8      | P0       | XXL              |
| §20 RMS                  | Full modules                   | PARTIALLY_COMPLETE | NERIS/CAD/FX         | Scope                 | GAP-RMS-01             | MVP decision    | P0       | XXL              |
| §20.11 Incidents         | CAD+NERIS                      | PARTIALLY_COMPLETE | P1–P4                | Limitations           | GAP-CAD-01             | Close; no P5    | P1       | L                |
| §21 Academy↔RMS          | Sync boundary                  | NOT_STARTED        | —                    | —                     | GAP-INT-01             | After Academy   | P1       | L                |
| §22 Creator Console      | Full §22                       | PARTIALLY_COMPLETE | creator-console      | —                     | GAP-CC-01              | Expand          | P2       | L                |
| §23 Subscriptions        | Lifecycle                      | PARTIALLY_COMPLETE | ADR-019              | Billing               | GAP-SUB-01             | Later           | P2       | L                |
| §24 Support access       | Timed sessions                 | NEEDS_VERIFICATION | TBD                  | Confirm               | GAP-SUP-01             | Verify          | P2       | M                |
| §25 Reporting            | Report builder                 | NOT_STARTED        | —                    | —                     | GAP-RPT-01             | Phase 11        | P2       | XL               |
| §26 Documents            | Template engine                | NOT_STARTED        | —                    | —                     | GAP-DOC-01             | Engine          | P2       | XL               |
| §27 Notifications        | Multi-channel                  | NOT_STARTED        | Stub                 | —                     | GAP-NTF-01             | Engine          | P2       | XL               |
| §28 API standards        | /api/v1 OpenAPI                | PARTIALLY_COMPLETE | platform-api         | OpenAPI               | GAP-API-DOC            | Expand          | P2       | M                |
| §29 Events               | Outbox                         | PARTIALLY_COMPLETE | events+worker        | Catalog               | —                      | Expand          | P2       | M                |
| §30 Observability        | CW dashboards                  | PARTIALLY_COMPLETE | CDK monitoring       | Completeness          | GAP-OBS-01             | Ops             | P2       | M                |
| §31 Security docs        | Named set                      | PARTIALLY_COMPLETE | docs/security        | Diff                  | GAP-SEC-DOC            | Create          | P1       | S                |
| §32 Classification       | Levels                         | PARTIALLY_COMPLETE | Security docs        | Register              | —                      | Complete        | P2       | S                |
| §33 Offline              | Encrypted sync                 | NOT_STARTED        | —                    | —                     | GAP-OFF-01             | Later           | P2       | XL               |
| §34 Accessibility        | WCAG 2.2 AA                    | PARTIALLY_COMPLETE | FX conditional       | Prod pass             | GAP-A11Y-01            | Pilot           | P2       | M                |
| §35 Testing              | Broad matrix                   | PARTIALLY_COMPLETE | Hot paths            | Full matrix           | GAP-TST-01             | Expand          | P2       | L                |
| §36 CI/CD                | Full GHA                       | PARTIALLY_COMPLETE | Workflows            | Checklist             | —                      | Audit           | P2       | M                |
| §37 Migrations           | Versioned                      | COMPLETE           | 0000–0027            | —                     | —                      | Maintain        | P1       | —                |
| §38 Firebase migration   | Cutover                        | NOT_STARTED        | Inventory            | —                     | GAP-MIG-01             | Phase 8         | P0       | XXL              |
| §39 GovCloud docs        | Pack                           | PARTIALLY_COMPLETE | Discovery            | Pack                  | GAP-017                | Before 12       | P2       | M                |
| §40 DR                   | RPO/RTO drills                 | PARTIALLY_COMPLETE | Backup               | Drill                 | —                      | Schedule        | P1       | M                |
| §41 Required docs        | Named guides                   | PARTIALLY_COMPLETE | docs tree            | Diff                  | GAP-DOCX-01            | Doc map         | P2       | M                |
| §42 Phases               | §42 order                      | PARTIALLY_COMPLETE | DR-1 + AX-SEQ-01     | Enforce               | AX-SEQ-01              | Prefer §42      | P0       | —                |
| §43 Cursor rules         | Working rules                  | PARTIALLY_COMPLETE | .cursor/rules        | Continuous            | —                      | Enforce         | P1       | —                |
| §44 DoD                  | Module DoD                     | PARTIALLY_COMPLETE | Acceptances          | Strict gates          | —                      | Gate            | P1       | —                |
| §45 Sprints 1A–1D        | Foundations                    | COMPLETE           | Sprint summaries     | —                     | —                      | Done            | P3       | —                |
| §46 Sprint outputs       | Status current                 | PARTIALLY_COMPLETE | DR-1 refresh         | Keep current          | —                      | Maintain        | P1       | S                |
| §47 Deploy commands      | Documented                     | PARTIALLY_COMPLETE | Scripts/docs         | Completeness          | —                      | Verify          | P2       | S                |
| §48 Final outcome        | One foundation                 | NOT_STARTED        | In progress          | Long horizon          | —                      | Continue        | P0       | XXL              |

## Governance note (DR-1)

Legacy roadmap Phases 1–17 are **SUPERSEDED** as SoT. Section-level rows above are authoritative for requirement status; phase scorecard is authoritative for §42 rollup.
