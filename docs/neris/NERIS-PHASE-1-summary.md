# NERIS Phase 1 Summary — Schema Foundation

**Date completed:** 2026-07-26  
**Status:** COMPLETE  
**Account / region:** `511343547817` / `us-east-1`  
**ADR:** [ADR-030](../decisions/ADR-030-neris-schema-registry-overlays.md)

## Scope lock

**In:** versioned NERIS schema registry, idempotent import, safe condition parser (no `eval`), value-set/overlay/validation services, Creator Console read-only schema browsers behind feature flags, permissions, migrations, tests, docs.

**Out:** incident forms, CAD adapters, manual intake UI, submission, offline sync, analysis/CRR/health workflows (Phase 2+).

## Delivered

### Package `@forge/neris`

- Registries: `packages/neris/registries/neris_field_registry.json`, `neris_value_sets.json`
- `RuleNode` types + `evaluateRule` + `parseConditionExpression` (structured or `NEEDS_REVIEW` prose)
- Expected counts: **39 modules / 682 fields / 147 value sets / 1,537 options**

### Database

- Schema: `packages/database/src/schema/neris.ts`
- Migrations: `0007_neris_schema_foundation`, `0008_neris_field_ordinal_unique`
- Tenant overlay tables on FORCE RLS (`tenant_neris_*`)
- CLI: `pnpm neris:import-schema` (idempotent; incomplete checksum versions are repaired)
- Seed: RMS module `NERIS`; flags `rms.neris.registry.enabled` (default true), `rms.neris.schema_browser.enabled` (default false)

### platform-api (`NerisModule`)

| Service                            | Role                                                               |
| ---------------------------------- | ------------------------------------------------------------------ |
| `NerisSchemaRegistryService`       | Packages, versions, modules, fields, conditions, mappings, imports |
| `NerisValueSetService`             | Namespaced value sets, options (active-only for new), hierarchy    |
| `NerisConditionEngine`             | Evaluate stored rule trees (no eval)                               |
| `NerisConfigurationOverlayService` | Tenant overlays only; rejects official key/code mutation           |
| `NerisSchemaValidationService`     | Integrity + validation results                                     |
| `NerisAccessService`               | Feature-flag gates (schema browser / registry)                     |

Permissions: `platform.neris.schema.read|import`, `platform.neris.overlay.read|manage` (import is creator-only).

Events: `neris.schema.version.published.v1`, `neris.overlay.updated.v1`.

### Creator Console

Nav group **NERIS Schema** with pages under `/neris/*` (packages, versions, modules, fields, value-sets, conditions, mappings, validation). Gated by `platform.neris.schema.read` + `rms.neris.schema_browser.enabled` (platform admin bypass). Official codes are read-only in UI.

## Local verification (exact)

| Step                                     | Result                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| Local migrate `0007`/`0008`              | OK                                                                              |
| `pnpm neris:import-schema` (1st)         | `IMPORTED_PUBLISHED` — 39 / 682 / 147 / 1537; validation warnings 108; errors 0 |
| `pnpm neris:import-schema` (2nd)         | `SKIPPED_IDENTICAL` — same counts                                               |
| `@forge/neris` unit tests                | **10 passed**                                                                   |
| NERIS integrity + RLS (`test:neris`)     | **5 passed**                                                                    |
| NERIS API e2e (`neris.e2e.test.ts`)      | **5 passed**                                                                    |
| Creator Console typecheck + `next build` | OK (NERIS routes exported)                                                      |
| `@forge/platform-api` build / lint       | OK                                                                              |
| `@forge/database` lint                   | OK                                                                              |

Checksum: `f3e3f6d307904aa124cd52f1040a0645451e2fdcbbef17f17750091cfb1dd00d`

## Development Aurora verification

| Step                                      | Result                                                      |
| ----------------------------------------- | ----------------------------------------------------------- |
| `cdk deploy ForgeCompute` (task def `:8`) | OK                                                          |
| Aurora migrate ECS (`migrate-ecs.js`)     | exit 0                                                      |
| Aurora seed ECS (`seed.js`)               | exit 0                                                      |
| NERIS import ECS (1st)                    | exit 0 — `IMPORTED_PUBLISHED` 39/682/147/1537; warnings 108 |
| NERIS import ECS (2nd)                    | exit 0 — `SKIPPED_IDENTICAL` 39/682/147/1537                |
| `pnpm smoke:development` `/health`        | OK                                                          |

Scripts: `scripts/run-ecs-migrate.mjs`, `scripts/run-ecs-seed.mjs`, `scripts/run-ecs-neris-import.mjs` (Windows-safe `file://` overrides via `scripts/ecs-oneoff.mjs`).

## Limitations / Phase 2 start

- Schema browser flag defaults **false**; creators use platform-admin bypass in Console.
- Overlay Console UI is API-backed; dedicated tenant overlay editor is minimal (API + tests).
- Import publish writes DB history/validation; Nest outbox for publish is not required for CLI import path.
- Phase 2 start: **Core Incident Shell + MANUAL_ONLY intake** (no CAD adapters yet; operating mode enum already on tenant config).

## Files of note

- `packages/neris/**`
- `packages/database/src/schema/neris.ts`, `drizzle/0007_*`, `drizzle/0008_*`, `src/neris/import-schema.ts`
- `apps/platform-api/src/modules/neris/**`
- `apps/creator-console/src/app/neris/**`, `src/components/neris-schema-gate.tsx`
- `docs/decisions/ADR-030-neris-schema-registry-overlays.md`
- `scripts/run-ecs-neris-import.mjs`, `scripts/ecs-oneoff.mjs`
