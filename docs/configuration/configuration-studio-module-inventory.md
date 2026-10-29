# Configuration Studio — Module Inventory (27) — release readiness

**Date:** 2026-07-28  
**Live API:** `forge-development-ecs-platform-api:27` / `config-accept-20260728054933`  
**Validation:** `scripts/config-studio-module-validation.mjs` → **27/27 PASS**  
**Evidence:** `docs/testing/evidence/config-final-acceptance/studio-module-validation.json`

Classification: all modules remain **OPERATIONAL_GENERIC_EDITOR** (JSON lifecycle editor + live API). No OPERATIONAL_RICH_BUILDER. No PLACEHOLDER. No mock-only data observed.

| #    | Module             | Namespace         | Live lifecycle*                                                                       | Classification             |
| ---- | ------------------ | ----------------- | ------------------------------------------------------------------------------------- | -------------------------- |
| 1–27 | All Studio modules | all 27 namespaces | load/create/update/publish/compare/schedule/activate/rollback/archive/version history | OPERATIONAL_GENERIC_EDITOR |

\*Permissions exercised via Forge Creator principal; audit via API `audit_events` writes.

Tenant Admin delegated subset (13) hosted at `https://d1uxdl4szvsixc.cloudfront.net`.
