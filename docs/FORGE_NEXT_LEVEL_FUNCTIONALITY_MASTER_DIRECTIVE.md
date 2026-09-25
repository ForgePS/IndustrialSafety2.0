# FORGE INDUSTRIAL SAFETY 2.0
# NEXT-LEVEL FUNCTIONALITY MASTER DIRECTIVE

Repository: `ForgePS/IndustrialSafety2.0`
Primary integration branch: `forge-creator-2.0`

## MISSION

Continue building Forge Industrial Safety 2.0 into a production-grade industrial safety operating system.

This is NOT a UI prototype exercise.

Every feature built under this directive must be:

* fully persisted in PostgreSQL/Supabase;
* tenant isolated;
* permission controlled;
* scope controlled;
* auditable;
* integrated with related Forge modules;
* Creator configurable where appropriate;
* usable on desktop and field/mobile layouts;
* connected to Forge AI where appropriate;
* covered by automated tests;
* covered by browser smoke tests;
* validated against cross-tenant access;
* built with real lifecycle/workflow behavior;
* production build safe.

A feature is NOT complete because a page renders.

A feature is complete only when its entire path works:

`UI → server action/API → authorization → validation → database → related modules → activity/audit → notifications/automation → reporting/AI context → automated tests`

---

# ABSOLUTE RULE: NO SHELLS

DO NOT create:

* placeholder pages;
* fake dashboards;
* hard-coded KPI values;
* fake alerts;
* fake database rows;
* localStorage as system of record;
* static arrays pretending to be backend data;
* mock APIs in production paths;
* TODO workflow buttons;
* buttons without server-side behavior;
* forms that do not persist;
* "Coming Soon" functionality;
* disconnected duplicate modules;
* duplicate personnel systems;
* duplicate location systems;
* duplicate task systems;
* duplicate permission frameworks;
* generic JSON blobs as substitutes for first-class domain data.

`custom_data jsonb` may be used only for tenant-configurable custom fields.

Core operational fields, relationships, lifecycle state, approvals, risks, assignments, and compliance data MUST use explicit relational structures.

---

# EXISTING ARCHITECTURE MUST BE REUSED

Before modifying a domain, inspect the current implementation and reuse existing patterns.

Required existing systems include:

* `organizations`
* `organization_memberships`
* `divisions`
* `locations`
* Creator feature registry
* Creator permission registry
* tenant roles
* individual permission overrides
* Location/Division scope
* `getTenantContext`
* `requireTenantPermission`
* `getEffectiveTenantAccess`
* Forge scope helpers
* Creator forms
* Creator lookups
* Creator navigation
* audit infrastructure
* Personnel
* Training
* Incidents
* Inspections
* Assets & Equipment
* QR
* LOTO
* Tasks
* Corrective Actions/CAPA after its branch is incorporated
* Forge AI capability registry
* Forge AI action approval system
* Forge AI Knowledge
* Forge AI Watch
* Forge AI Analytics
* Customer Support

Do not create parallel implementations of services that already exist.

---

# TENANT SECURITY

Every operational table must contain an authoritative `organization_id`.

Every tenant-owned relationship must be validated against that organization.

Never trust:

* organization ID from a browser without server validation;
* Location ID from a browser without tenant validation;
* Division ID from a browser without tenant validation;
* Personnel ID from a browser without tenant validation;
* Asset ID from a browser without tenant validation.

Every new operational table must have appropriate PostgreSQL RLS enabled.

Authenticated users may only directly read rows permitted by RLS.

Operational writes should continue through server-side Forge domain actions using the established authorization model.

Service-role access NEVER replaces permission checking.

Required security order:

`authenticated user`
→ `active organization`
→ `feature entitlement`
→ `permission`
→ `scope`
→ `record relationship validation`
→ `sensitive-data rules`
→ `business rule`
→ mutation

Cross-tenant access must fail even when an attacker supplies another tenant's UUID directly.

---

# PERMISSIONS

Every significant capability must receive stable permission keys.

Use action-specific permissions rather than one giant manage permission when appropriate.

Examples:

* `.view`
* `.create`
* `.edit`
* `.submit`
* `.approve`
* `.execute`
* `.verify`
* `.close`
* `.archive`
* `.configure`
* `.export`
* `.view_sensitive`

Register permissions in Creator.

Provide sensible defaults for:

* employee
* supervisor
* location administrator
* safety manager
* company administrator
* company owner

Honor effective permission overrides and Location/Division scope.

---

# RECORD LIFECYCLE

Regulated operational records must NOT be physically deleted during normal operation.

Use:

* archive;
* retire;
* void;
* cancel;

where appropriate.

Preserve historical state.

Every status transition must be:

1. validated server-side;
2. permission checked;
3. scope checked;
4. business-rule checked;
5. timestamped;
6. actor identified;
7. written to activity/history;
8. written to Forge audit when required.

Do not allow the UI to bypass lifecycle rules.

---

# SHARED RELATIONSHIPS

Forge 2.0 must become interconnected.

Use explicit relational links so the following chain can work:

`Incident / Inspection / Observation / JSA / Audit / Asset / LOTO / Permit / Risk / MOC`
→ `CAPA`
→ `Task`
→ `Verification`
→ `Effectiveness Review`
→ `Closure`

And:

`Personnel`
→ `Training`
→ `Qualification`
→ `Work eligibility`

And:

`Asset`
→ `QR`
→ `Inspection`
→ `Maintenance`
→ `Incident`
→ `LOTO`
→ `Permit`
→ `CAPA`
→ `Document`
→ `Risk`

Users must not repeatedly type data Forge already knows.

---

# ACTIVITY + AUDIT

Every important mutation must preserve:

* organization;
* actor;
* action;
* timestamp;
* resource type;
* resource ID;
* meaningful metadata;
* before/after values where appropriate.

Operational activity history must be visible on the related record.

Compliance-sensitive actions must also enter the immutable audit system.

---

# ATTACHMENTS / EVIDENCE

Do not implement module-specific unsafe attachment storage.

Reuse the existing private storage/authorization approach.

Evidence must support record-level authorization.

Where a workflow requires proof of completion, store structured evidence relationships instead of merely putting a URL in a text field.

---

# CREATOR CONFIGURATION

Where appropriate, modules must register:

* feature;
* navigation;
* permissions;
* lookups;
* configurable forms;
* tenant configuration;
* role defaults.

Tenant administrators may configure within the ceiling established by Forge Creator.

Tenant configuration may not weaken platform security boundaries.

---

# FORGE AI

Forge AI is an intelligence layer, not an unrestricted database agent.

Reuse the existing:

* capability registry;
* provider adapter;
* knowledge retrieval;
* approved-action queue;
* tool authorization;
* Watch engine;
* analytics engine;
* usage tracking;
* audit records.

AI must never receive unrestricted service-role/database mutation ability.

All AI write actions must invoke normal Forge server-side domain actions.

Safety/compliance conclusions remain subject to human review.

AI should identify, summarize, draft, correlate, explain, and propose actions.

It should not silently make final safety-critical decisions.

---

# FORGE GUARDIAN

Forge Guardian will become the cross-module intelligence engine.

Do NOT implement Guardian as a chatbot.

Guardian will consume structured safety signals emitted by operational modules and evaluate:

* risk;
* overdue conditions;
* repeat events;
* qualification gaps;
* incompatible work;
* unresolved critical controls;
* asset conditions;
* permit conditions;
* CAPA status;
* recurring hazards;
* serious-injury/fatality precursor conditions.

Every Guardian alert must explain WHY it exists and link back to supporting records.

---

# EXPLICITLY EXCLUDED

Do NOT build:

1. computer-vision camera monitoring;
2. wearable/connected-worker monitoring.

Do not add either capability indirectly.

---

# FIELD / MOBILE REQUIREMENTS

Operational workflows must work cleanly on narrow mobile screens.

Field workflows should minimize typing.

Use:

* existing lookups;
* known employee information;
* known Location;
* known Division;
* known Asset;
* QR context;
* source record context;

to prefill information where valid.

---

# OFFLINE

Modules explicitly designated for offline operation must use a controlled sync architecture.

Do not make the primary production database a browser-only database.

Offline mutations must include:

* durable local operation ID;
* original timestamp;
* actor;
* organization;
* record type;
* payload;
* sync state;
* retry state;
* conflict state.

Server must enforce normal permissions again at sync time.

---

# CONCURRENCY + IDEMPOTENCY

Any high-impact action vulnerable to double submission must be idempotent.

Examples:

* permit activation;
* CAPA closure;
* emergency activation;
* LOTO application start;
* AI approved actions;
* notification dispatch;
* workflow transitions.

Prevent duplicate records caused by double clicking or network retries.

---

# ERROR HANDLING

Never swallow a failed backend operation and show success.

User-visible operations must produce:

* success only after persistence succeeds;
* actionable validation errors;
* authorization errors without data leakage;
* conflict errors where current state has changed.

---

# REQUIRED TESTING FOR EVERY SPRINT

Unless explicitly not applicable, add:

## Database tests

* migration applies to clean database;
* migration applies through full existing migration chain;
* seed succeeds;
* constraints work;
* lifecycle checks work.

## Authorization tests

* authorized tenant succeeds;
* unauthorized role fails;
* out-of-scope record fails;
* cross-tenant direct-ID access fails;
* archived/closed records obey lifecycle rules.

## Domain tests

Test state transitions and business rules directly.

## Browser smoke tests

Test the actual user workflow in Playwright.

Do not limit tests to whether the page loads.

## Regression

Existing core module smoke tests must continue passing.

---

# REQUIRED VALIDATION GATE

Before declaring any sprint complete, run the repo's actual equivalents of:

```bash
pnpm web:supabase:reset
pnpm type-check
pnpm build
```

Run relevant Playwright/smoke suites.

Run new sprint-specific tests.

Do not declare completion with TypeScript errors.

Do not declare completion with failed migrations.

Do not declare completion with skipped core workflow tests.

Do not declare completion because only the modified files compile.

---

# REQUIRED COMPLETION REPORT

At the end of every sprint report:

1. branch;
2. migrations added;
3. tables/functions/policies added;
4. permissions added;
5. routes/pages added;
6. server/domain actions added;
7. integrations completed;
8. AI capabilities/actions added;
9. tests added;
10. database reset result;
11. type-check result;
12. production build result;
13. browser smoke result;
14. cross-tenant security result;
15. remaining defects;
16. anything intentionally deferred.

If any acceptance requirement is incomplete, state:

`SPRINT NOT COMPLETE`

Do not soften the result.

# END MASTER DIRECTIVE
