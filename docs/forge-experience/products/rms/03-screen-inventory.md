# Screen Inventory — Forge RMS

**Document:** `03-screen-inventory.md`  
**Verified:** 2026-07-30

## Screen catalog

| ID      | Screen               | Route               | Type             | Roles (typical)    | Notes                      |
| ------- | -------------------- | ------------------- | ---------------- | ------------------ | -------------------------- |
| SCR-001 | Home hub             | `/`                 | Hub              | All signed-in      | Links into flagged modules |
| SCR-002 | Login                | `/login/`           | Auth             | Public             | Cognito                    |
| SCR-003 | Auth callback        | `/auth/callback/`   | Auth             | Public             | OAuth return               |
| SCR-004 | Select tenant        | `/select-tenant/`   | Auth             | Multi-tenant users | Tenant isolation critical  |
| SCR-005 | Health               | `/health/`          | Ops              | Public/ops         | API probe                  |
| SCR-006 | Incident list        | `/incidents/`       | Table/list       | Incident viewers   | ListControlsView (web-kit) |
| SCR-007 | Manual intake        | `/incidents/new/`   | Form             | Creators           | High-risk create path      |
| SCR-008 | Incident workspace   | `/incidents/[id]/`  | Record workspace | Editors/reviewers  | 22 sections + modals       |
| SCR-009 | Officer review queue | `/review/`          | Queue/table      | Reviewers          | Status filters             |
| SCR-010 | NERIS configuration  | `/configuration/`   | Form/config      | Config managers    | Tenant NERIS settings      |
| SCR-011 | CAD operations       | `/cad/operations/`  | Ops dashboard    | CAD ops            | Closest “dashboard”        |
| SCR-012 | CAD conflicts        | `/cad/conflicts/`   | Queue            | CAD reviewers      | Conflict resolution        |
| SCR-013 | CAD messages         | `/cad/messages/`    | Table            | CAD ops            | Message log                |
| SCR-014 | CAD connections      | `/cad/connections/` | Config           | CAD admins         | Connection lifecycle       |
| SCR-015 | CAD unmapped         | `/cad/unmapped/`    | Queue            | CAD admins         | Mapping debt               |
| SCR-016 | CAD mappings         | `/cad/mappings/`    | Config/table     | CAD admins         | Unit/personnel maps        |

## Incident workspace sub-screens (sections)

Each section is a workspace tab/panel within SCR-008 (not separate routes). Specialty sections gate on permissions + `specialtyWorkflows` flag.

## Modals / overlays (in-workspace)

| Modal/panel                | Host screen         | Notes                 |
| -------------------------- | ------------------- | --------------------- |
| Officer review actions     | SCR-008 / SCR-009   | Approve/return/submit |
| Specialty review           | SCR-008             | Permission-gated      |
| Attachment gallery actions | SCR-008 ATTACHMENTS | Upload/archive        |
| AI narrative assistant     | SCR-008 NARRATIVE   | Multi AI flags        |
| Searchable select pickers  | SCR-008 / forms     | Local component       |
| Feature disabled panel     | FeatureGate         | Shared pattern        |

## Dashboards

| Name                  | Present? | Location       |
| --------------------- | -------- | -------------- |
| Executive dashboard   | No       | —              |
| Operational dashboard | Partial  | CAD operations |
| Personal / My Work    | No       | —              |
| Module dashboards     | No       | —              |
| Home hub cards        | Yes      | SCR-001        |

## Mobile views

No separate mobile routes. Responsive CSS + e2e `mobile.spec.ts`, `phase-3-mobile-matrix.spec.ts`. Shell has `mobileNavToggle`.

## Role-specific screens

No distinct role-only route trees. Visibility via flags + API permission enforcement. Role packs defined in `FORGE_RMS_TEMPLATE` / `RMS_*_PERMISSIONS`.

## Employee portal / public screens

| Screen class        | In rms-web?                          |
| ------------------- | ------------------------------------ |
| Employee portal     | No (`apps/department-portal` stub)   |
| Public registration | No (`apps/public-registration` stub) |
| Public CAD webhook  | API only (not UI)                    |

## Incomplete functionality

| Screen                     | Incomplete aspect                 |
| -------------------------- | --------------------------------- |
| Shell nav vs Config Studio | Dual sources; studio unused       |
| CAD transports             | Some not implemented backend-side |

## Planned screens (not inventoriable yet)

Personnel, training, scheduling, daily log, documents, fleet/apparatus, prevention tree, hydrants, preplans, reports, My Work, global search, notifications — track when UI lands; do not fabricate routes.
