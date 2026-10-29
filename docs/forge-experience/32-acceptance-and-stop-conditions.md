# FX-S0 Acceptance Criteria & Stop Conditions

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** FOUNDATION COMPLETE (documentation) — pending internal review sign-off  
**Author:** Forge Experience Program  
**Last Updated:** 2026-07-30

## Purpose

Define when the Forge Experience Foundation is complete and what must **not** happen in this phase.

## Acceptance criteria — Forge Experience Foundation

| Criterion                         | Status                 |
| --------------------------------- | ---------------------- |
| Shared architecture documented    | ✓                      |
| Design system complete            | ✓                      |
| Design tokens complete            | ✓                      |
| Component library complete        | ✓                      |
| Navigation framework complete     | ✓                      |
| Dashboard framework complete      | ✓                      |
| Workspace framework complete      | ✓                      |
| Record framework complete         | ✓                      |
| Forms framework complete          | ✓                      |
| Reporting framework complete      | ✓                      |
| Notification framework complete   | ✓                      |
| Search framework complete         | ✓                      |
| Mobile framework complete         | ✓                      |
| Accessibility standards complete  | ✓                      |
| Offline framework complete        | ✓                      |
| Product extension rules complete  | ✓                      |
| Pattern library complete          | ✓                      |
| Documentation internally reviewed | □ pending human review |
| Gap analysis completed            | ✓                      |
| Adoption roadmap completed        | ✓                      |

**Foundation documentation pack:** COMPLETE for FX-S0 content authoring.  
**Formal approval:** Required before production implementation.

---

## Cursor / engineering stop conditions (FX-S0)

**DO NOT:**

- Modify production code
- Replace existing application shells
- Change backend APIs
- Modify authentication
- Modify authorization
- Alter Firestore collections
- Alter PostgreSQL schemas
- Modify Cloud Functions
- Deploy infrastructure
- Change routing
- Replace Creator Console
- Replace Tenant Administration
- Begin production UI migration
- Implement workflow engines
- Replace search services
- Replace notification services
- Introduce breaking changes

This phase is **documentation, architecture, planning, and isolated prototypes only**.

Production implementation begins only after:

1. Formal approval of the Forge Experience Foundation
2. Current platform stabilization work is complete

---

## END OF FX-S0 FOUNDATION (content)

FX-S0 documentation deliverables are authored. Remaining gate: internal review checkbox above.

## Revision history

| Date       | Change                  |
| ---------- | ----------------------- |
| 2026-07-30 | FX-S0 closeout criteria |
