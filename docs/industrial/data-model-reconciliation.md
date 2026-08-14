# FORGE-INDUSTRIAL-MODEL-RECONCILIATION-S1

**BASE_SHA:** `32e3f8f1468b1299bc48c9a1709a7683e1fdd286`  
**Branch:** `industrial/model-reconciliation-s1`  
**Production master SHA:** `32e3f8f`  
**Production API:** task definition revision **17** (`onboarding-closeout-20260814121500`)  
**ADR:** [ADR-industrial-data-model.md](./ADR-industrial-data-model.md)

---

## 1. Models

### MODEL A — Master / Production (AUTHORITATIVE)

| Metric | Value |
|--------|-------|
| Primary migration | `0040_industrial_domain_s1.sql` + `0041_onboarding_org_lookups_s1.sql` |
| `industrial_*` table count | **56** (+ QR/doc/EHS/platform companions) |
| Nest prefix implemented | `api/v1/tenants/:tenantId/industrial` (org/fleet) **plus** flat `api/v1/industrial/*` (Model A completion S1) |
| industrial-web expected prefix | `/api/v1/industrial/*` (flat) — **contract closed in MODEL-A-APPLICATION-COMPLETION-S1** |
| `industrial_ops_records` | **Absent** from schema/API (docs-only mention as unused other-branch thin ops) |

Core domains (tables): sites, departments, positions, employment_types, personnel, equipment, LOTO libraries/procedures/energy/isolation/steps/revisions/records, corrective_actions, incidents, inspections, observations, jsas, form_definitions/submissions, training_records, certificate_templates, tasks, emergency/chemical/confined/hot-work/contractor/cranes/electrical/environmental/forklift/machine/manufacturing/process/warehouse/heights/dot records, osha_cases, fleet vehicles/drivers/settings, workers_comp cases/carriers/work_status/restrictions/medical, qr_links/versions, scan_*, platform_documents/versions, equipment_document_links, attachments, ehs audit templates, migration_id_map, history_records.

RLS: ENABLE + FORCE + tenant isolation on `app.current_tenant_id` for domain tables.

### MODEL B — Diverged branch (DEPRECATED)

| Metric | Value |
|--------|-------|
| Migration | `0028_industrial_ops_records.sql` (branch journal — not on master) |
| Shape | `id, tenant_id, module, title, status, payload jsonb, record_version, timestamps, archived_at` |
| Modules in `INDUSTRIAL_OPS_MODULES` | personnel, training, forms, inspections, incidents, jsas, observations, equipment, sites, loto, dot, workers-comp |
| API | `IndustrialOpsController` → `api/v1/industrial/{module}` + analytics |
| Photos | Inside `payload` (`photoDataUrl`, …) |
| Analytics | All KPIs from `industrial_ops_records` |

---

## 2. Critical production finding (API / FE contract)

Master **DDL is rich**; master **Nest industrial controller is thin**; master **industrial-web** still configures flat paths such as `/api/v1/industrial/incidents`. Production therefore has Model A data capacity without matching Nest handlers for most module CRUD the SPA expects. The diverged branch closed that gap by implementing those routes against Model B.

**Forward-port rule:** implement the flat contract against **Model A tables**, never against `industrial_ops_records`.

---

## 3. Feature parity matrix

| FEATURE | MASTER IMPLEMENTATION | DIVERGED IMPLEMENTATION | MASTER STATUS | DIVERGED STATUS | UNIQUE? | TARGET DECISION | FORWARD-PORT? |
|---------|----------------------|-------------------------|---------------|-----------------|---------|-----------------|---------------|
| Org sites/depts/positions/employment types | Normalized tables + Nest CRUD (partial) | `module=sites` JSON rows | MASTER_PARTIAL | DUPLICATE | No | Keep Model A; complete Nest | YES (API completeness) |
| Personnel roster | `industrial_personnel` + Nest GET; FE expects full CRUD | ops `personnel` JSON + photo in payload | MASTER_PARTIAL | BETTER_ON_BRANCH (API/UX) | Photo UX | Model A + attachments | YES |
| Training records | `industrial_training_records` DDL | ops `training` | MASTER_PARTIAL | BRANCH_ONLY (working API) | Bulk recorder UX | Model A | YES |
| Incidents | `industrial_incidents` DDL | ops incidents wizard + CAPA | MASTER_PARTIAL | BETTER_ON_BRANCH (API/UX) | Wizard UX | Model A | YES |
| Inspections | `industrial_inspections` DDL | ops inspections wizard | MASTER_PARTIAL | BETTER_ON_BRANCH | Wizard UX | Model A | YES |
| Observations / JSAs / Forms | DDL present | ops CRUD | MASTER_PARTIAL | BRANCH_ONLY | No | Model A | YES |
| Equipment | DDL; FE workspace; Nest incomplete | ops equipment + archive | MASTER_PARTIAL | BETTER_ON_BRANCH | Archive flow | Model A | YES |
| LOTO graph | Full normalized LOTO tables + Nest list | Flattened procedure JSON in ops | BETTER_ON_MASTER (schema) | BETTER_ON_BRANCH (tabbed UX) | UX tabs | Model A + UX | YES (UX) |
| Workers' Comp | Normalized WC + medical RLS tables | ops JSON + case tabs UX | BETTER_ON_MASTER (schema) | BETTER_ON_BRANCH (UX) | Case tabs | Model A + UX | YES (UX) |
| DOT / OSHA / high-risk / compliance suite | Per-domain `*_records` / osha_cases DDL | Compliance UI; many without Nest on branch | MASTER_PARTIAL | MASTER_PARTIAL | No | Model A | YES (API later) |
| Fleet | Normalized fleet tables + Nest vehicles/drivers | Fleet BACKEND_GAP on branch | BETTER_ON_MASTER | OBSOLETE gap UI | No | Model A | NO (already better) |
| Corrective actions | Table + Nest CRUD | CAPA fields in incident/inspection payload | BETTER_ON_MASTER | DUPLICATE | No | Model A | NO |
| QR / Scan / Documents | Normalized QR/scan/doc tables | Mostly LEGACY_FIREBASE / limited | MASTER_PARTIAL | OBSOLETE/LEGACY | No | Model A | FUTURE |
| Analytics | Not rebuilt on Model A tip | Full analytics from ops_records | NEEDS_REDESIGN | BRANCH_ONLY | Yes | Rebuild on Model A | YES |
| FilterPanel / FieldQuickBar / mobile | Absent | Present (Waves 3–4) | MISSING | BRANCH_ONLY | UX | Port to master FE | YES |
| Admin Settings sections | Basic settings | Tabbed Administration | MASTER_PARTIAL | BETTER_ON_BRANCH | UX | Port UX | YES |
| Journey contracts | Absent | `journeys.ts` + tests | MISSING | BRANCH_ONLY | Test harness | Port | YES |
| Public login-branding by host | Not on master Nest | Branch route + `forge_lookup_tenant_domain` | MASTER_COMPLETE (N/A) | BRANCH_ONLY | Optional | Discard or redesign on Model A later | NO (optional future) |
| `industrial_ops_records` itself | Absent | Core store | N/A | DEPRECATED | — | Retire | NO |

**Classification counts (approx.):**

| Class | Count |
|-------|-------|
| MASTER_COMPLETE / BETTER_ON_MASTER (schema) | Fleet, CA, LOTO/WC schema, org DDL |
| MASTER_PARTIAL | Most module CRUD APIs, FE contract mismatch |
| BRANCH_ONLY (worth porting) | Flat ops API surface, analytics service, FilterPanel, FieldQuickBar, LOTO/WC/Settings UX, journeys |
| DUPLICATE | Generic JSON shadows of Model A entities |
| OBSOLETE | Deploying Model B; branch migration renumber-as-merge |
| NEEDS_REDESIGN | Analytics on Model A |

---

## 4. `industrial_ops_records` usage audit (diverged branch)

| Reference class | Examples | Disposition |
|-----------------|----------|-------------|
| BRANCH_ONLY_FEATURE | `0028_industrial_ops_records.sql`, `industrialOpsRecords` schema, ops service/controller, analytics service | Do not merge DDL; reimplement APIs on Model A |
| MIGRATION_TOOLING | `apply-industrial-ops-ddl.mjs`, probes, audit sentinels pointing at ops table | Retire or remap to Model A probes |
| TEMPORARY_COMPATIBILITY | None intended for production | — |
| OBSOLETE | Branch journal entries conflicting with master `0028_mk_*` | Leave on abandoned branch |
| REQUIRES_FORWARD_PORT | Flat REST contract, analytics behaviors, industrial-web UX | Forward-port without the table |

**UNKNOWN usages after audit:** 0 (all references classified).

---

## 5. a23a60a audit (forward-port decisions)

| Artifact | On master? | Decision |
|----------|------------|----------|
| `run-ecs-migrate.mjs` `--env` required | Unsafe default remains | **ADAPT → port** (set `FORGE_ENV`, wait/logs) |
| `ecs-oneoff.mjs` env-aware | Already via `FORGE_ENV` | **ADAPT lightly** — honor optional `options.forgeEnvironment` override |
| `audit-migration-state.mjs` | Missing | **YES → ADAPT** sentinels to Model A (`industrial_incidents`, `facilities`, billing tables, …) |
| `firebase-aws-parity.md` blocker | N/A on master | **NO** as-written; ADR + this doc replace it |

---

## 6. Firebase → master mapping (summary)

| Firebase domain | Master table(s) | Mapping status | Branch Model B dependency? |
|-----------------|-----------------|----------------|----------------------------|
| Personnel / employees | `industrial_personnel` (+ positions/employment types) | CAI / import tooling targets Model A | No |
| Sites / org | `industrial_sites`, departments | Present | No |
| Incidents | `industrial_incidents` | Schema ready; Nest CRUD gap | Must not depend on ops_records |
| Inspections / observations / JSAs / forms | Matching `industrial_*` | Schema ready; Nest gap | Same |
| LOTO | `industrial_loto_*` graph | Schema strong | Same |
| Training / certs | `industrial_training_records`, `industrial_certificate_templates` | Schema ready | Same |
| Workers' Comp | `industrial_workers_comp_*` | Schema + medical RLS | Same |
| Fleet | `industrial_fleet_*` | Schema + Nest | Same |
| QR / scan / docs | `qr_*`, `industrial_scan_*`, `platform_documents*` | Schema ready | Same |
| History / id map | `industrial_history_records`, `industrial_migration_id_map` | Present for import | Same |

**Important:** Success of any import against Model B on the diverged branch does **not** imply master semantic coverage. Target for all migration tooling after this sprint: **Model A only**.

---

## 7. Production data audit (READ-ONLY — COMPLETED)

**Script:** `node scripts/audit-industrial-production-data.mjs --env production`  
**Artifact:** `diag-industrial-data-audit-production.json`

| Probe | Result |
|-------|--------|
| `industrial_ops_records` | **ABSENT** (`to_regclass` null) — classification **ABSENT** (not ACTIVE_DEPENDENCY) |
| GENERIC_RECORD_COUNT | 0 |
| GENERIC_UNKNOWN | **0** |

### Normalized row counts (production)

| Table | Rows |
|-------|------|
| industrial_sites | 26 |
| industrial_departments | 90 |
| industrial_personnel | 1058 |
| industrial_equipment | 2489 |
| industrial_incidents | 12 |
| industrial_inspections | 6 |
| industrial_training_records | 17 |
| industrial_form_definitions | 48 |
| industrial_form_submissions | 34 |
| industrial_loto_procedures | 2539 |
| industrial_loto_records | 59 |
| industrial_corrective_actions | 14 |
| industrial_workers_comp_cases | 27 |
| industrial_fleet_drivers | 201 |
| qr_links | 2524 |
| industrial_migration_id_map | 42285 |
| industrial_history_records | 25325 |

Production contains **Model A data only**. No dual-model overlap. No orphans from Model B.

---

## 8. Forward-port plan (ordered)

1. **Tooling safety** — `--env` migrate + Model A audit scripts (**done this sprint**).
2. **Nest flat Industrial API** — `/api/v1/industrial/{bootstrap,personnel,sites,equipment,incidents,inspections,observations,jsas,loto}` against Model A (**started this sprint**).
3. **UX** — FilterPanel, FieldQuickBar, footer SoT cleanup (**done this sprint**).
4. **Analytics** — rewrite against Model A (**future work**).
5. **Remaining domain CRUD** — training/forms/DOT/WC/high-risk create/status/fields (**future work**).
6. **Retirement sprint** — N/A while Model B table remains ABSENT in production.

---

## 9. Deployment rule

This sprint does **not** authorize production deployment. Production remains on master `32e3f8f` / API rev 17 until a separate deploy authorization after review.
