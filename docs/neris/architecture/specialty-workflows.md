# Specialty Workflow Engine (Phase 3)

Forge does **not** create a second incident engine for fire and specialty workflows. Specialty sections are a presentation and activation layer over the existing incident shell, schema registry, condition engine, and field-value store.

## Package

`packages/neris/src/specialty-workflows.ts` (exported from `@forge/neris`)

## Responsibilities

The engine evaluates, for a given incident context:

- Which workflow groups apply
- Which are required, optional, active, hidden, or not applicable
- Which official NERIS modules belong to each group
- Recommended navigation order
- Activation reasons (plain language) for UX banners

Field-level visibility and requiredness remain the job of the NERIS condition engine and tenant overlays. The specialty engine decides **which sections exist in the workspace**, not how each field renders.

## Evaluation inputs

| Input                       | Source                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `availableModuleKeys`       | Published schema modules for the incident version                                                  |
| `classificationSignals`     | Primary + secondary incident type codes                                                            |
| `fieldValuesByKey`          | Live incident field values                                                                         |
| `notApplicableSectionKeys`  | `neris_incident_sections` with status `NOT_APPLICABLE`                                             |
| `forcedActiveSectionKeys`   | Manually activated specialty sections                                                              |
| `specialtyWorkflowsEnabled` | Feature flag `rms.neris.specialty_workflows.enabled` (default **false**; tenant override required) |

## Activation rules

Rules are declarative composites (`classificationSignals`, `fieldKeySignals`, `anyOf`, `allOf`, `modulePresent`, `always`). Groups are **not** activated by module presence alone; presence without a matching signal yields `OPTIONAL` (available via “Add specialty section”).

## States

| State            | Meaning                                      |
| ---------------- | -------------------------------------------- |
| `HIDDEN`         | Not shown in nav; modules not rendered       |
| `OPTIONAL`       | Available to add; not in nav until activated |
| `REQUIRED`       | Activated by rules; cannot be marked N/A     |
| `ACTIVE`         | Shown (manual add or optional activation)    |
| `NOT_APPLICABLE` | User marked N/A; values preserved            |

## Form descriptor integration

`IncidentFormDescriptorService.compose`:

1. Evaluates specialty workflows
2. Maps modules to specialty or core sections via `mapModuleToSpecialtySection`
3. Hides specialty modules until their group is active / required / N/A (N/A still listed)
4. Returns `navigationSections`, `specialtyWorkflows` (with completion metrics), and `availableSpecialtySections`

## API

| Method | Path                   | Behavior                                                      |
| ------ | ---------------------- | ------------------------------------------------------------- |
| `GET`  | `…/form-descriptor`    | Live specialty evaluation                                     |
| `POST` | `…/specialty-sections` | `ACTIVATE` \| `MARK_NOT_APPLICABLE` \| `CLEAR_NOT_APPLICABLE` |

`MARK_NOT_APPLICABLE` is rejected for groups that disallow N/A. Field values are never deleted when a section is hidden or marked N/A.

## UX contract

- Show only applicable sections
- Explain why a section activated
- Preserve values across classification changes; warn when a section leaves the nav
- Plain-language labels; technical codes hidden by default (overlays)
- Sticky incident header and save status (Phase 2 shell)

## Mapping to official NERIS

User-facing screens may group multiple official modules and fields. Mapping lives in `SPECIALTY_WORKFLOW_GROUPS` and `mapModuleToSpecialtySection`. Tenant overlays may refine labels and value sets; they must not invent a parallel schema.

## Out of scope

IRWIN transmission, ePCR clinical storage, CAD, external NERIS submit, offline sync, AI narrative.
