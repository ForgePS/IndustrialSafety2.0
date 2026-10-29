# NX-02H Gap Audit (working)

Generated before hardening. Status: SPRINT NOT COMPLETE until atomic RPCs land.

## Critical MISSING (block complete)
1. forge_perform_observation_lifecycle_transition (atomic)
2. forge_perform_risk_lifecycle_transition (atomic) + approval/acceptance/reviews
3. forge_perform_jsa_version_transition + forge_activate_jsa_revision (atomic)
4. JSA execution briefing/ACTIVE/STOPPED + crew ack via NX-01 + stop-work
5. Forge AI tools (6)
6. Matrix immutability for used versions
7. Status stripped from Risk/JSA form updates
8. Atomic create+link for CAPA/Risk integrations
9. Full Playwright suites + failure injection + concurrency tests

## PARTIAL (must close)
- Observation ACTION_REQUIRED close rules, archive, anonymous Playwright
- Risk activation gates, reopen, Incident/Finding→Risk
- JSA PPE/training/templates, immutability of non-draft, JSA→Risk/Asset
- Client concurrency on lifecycle controls
- Creator deep config knobs

## COMPLETE (foundation)
- Matrix tables/scoring/activation, Observations CRUD/anonymous storage, Risk CRUD/assess/controls/treatments, JSA authoring/executions basics, registries, workflow seeds, cross-module CAPA/Risk create actions (non-atomic), shallow Playwright, best-effort lifecycle controls
