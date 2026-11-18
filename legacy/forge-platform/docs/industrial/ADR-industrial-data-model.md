# ADR — Industrial Safety Authoritative Data Model

**Sprint:** FORGE-INDUSTRIAL-MODEL-RECONCILIATION-S1  
**Status:** ACCEPTED  
**Date:** 2026-08-14  
**BASE_SHA:** `32e3f8f1468b1299bc48c9a1709a7683e1fdd286` (master / production lineage)  
**Decision makers:** Forge platform engineering (this reconciliation sprint)

---

## Decision

| Field                              | Value                                                                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **AUTHORITATIVE_PRODUCTION_MODEL** | MODEL A — normalized Industrial schema (`0040_industrial_domain_s1` + `0041_onboarding_org_lookups_s1` + related platform/QR/doc tables) |
| **DEPRECATED_MODEL**               | MODEL B — single generic `industrial_ops_records` table (diverged branch `forge-ui-sneat-s0-s5`)                                         |

---

## Context

Production (database, API task definition revision 17, industrial-web) is on **master**. Master carries ~60 normalized Industrial tables. A diverged branch (~145 commits behind) introduced a competing thin-slice design: one `industrial_ops_records` row-per-document with `module` + `payload jsonb`. That branch must not be deployed to production.

Drizzle applies migrations by high-water mark on `created_at` / journal `when`. Branch migrations `0028`–`0030` sit **below** master's max `when` (`1754960000000`) and would silently no-op on production.

---

## Rationale

1. **Production already runs Model A.** Rolling production onto Model B would require destructive schema replacement and data rewrite.
2. **Model A matches Firebase migration intent.** Controlled Aurora import / CAI work targets normalized tables (`industrial_personnel`, `industrial_incidents`, LOTO graph, WC medical, scan/QR, etc.).
3. **Model B cannot express LOTO/WC/scan relationships safely.** Energy sources, isolation points, procedure revisions, WC medical encounters, and document versioning need first-class tables and RLS, not opaque JSON.
4. **No business capability on Model B fundamentally requires a generic table.** Branch value is UX polish and a **broader REST surface**; those map onto Model A as application behavior + missing Nest handlers.

---

## Features to forward-port (from diverged branch)

| Capability                                                                   | Target form                                             | Schema change?    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------- |
| Flat `GET/POST /api/v1/industrial/{domain}` contracts used by industrial-web | Nest controllers/services against **normalized** tables | No (tables exist) |
| Analytics overview/incidents/inspections/personnel/loto/dot/wc               | Rebuild queries on Model A tables                       | No                |
| FilterPanel + mobile drawer / chips                                          | industrial-web component                                | No                |
| FieldQuickBar sticky field CTAs                                              | industrial-web component                                | No                |
| LOTO tabbed workspace (dashboard/procedures/equipment/reviews)               | industrial-web against Model A LOTO APIs                | No                |
| Workers' Comp case tabs / KPI polish                                         | industrial-web against Model A WC tables                | No                |
| Admin/Settings section tabs                                                  | industrial-web                                          | No                |
| Journey contract tests                                                       | vitest contracts                                        | No                |
| `--env`-required migrate runner + migration ledger audit                     | scripts (see a23a60a review)                            | No                |

## Data to transform / preserve / archive

| Class                                            | Action                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Production normalized rows                       | **PRESERVE** — authoritative                                                                      |
| `industrial_ops_records` (if present in any env) | **ARCHIVE / TRANSFORM** via separate cleanup sprint after UNKNOWN=0; do not delete in this sprint |
| Branch-only journal entries / DDL for Model B    | **Do not apply to production**; retire from merge path                                            |

## Compatibility strategy

- No dual-read of Model A + Model B in production APIs.
- Temporary compatibility endpoints must be documented if introduced; default is **none**.
- industrial-web continues to call flat `/api/v1/industrial/*`; Nest must implement those against Model A (gap on master tip today).

## Migration strategy

- New schema only via **new** forward-only migrations after master's current max journal entry.
- **Do not renumber** production-applied migrations.
- Firebase→AWS importers must target Model A only; refuse Model B as default.

## Rollback strategy

- Application rollbacks: redeploy previous master API/frontend images (proven: API rev 17 + master static sync).
- Schema: additive-only migrations; no drop of Model A tables in this sprint.
- Model B retirement: separate authorized cleanup sprint only after classification UNKNOWN=0.

---

## Consequences

- Diverged branch is a **capability catalog**, not an integration base.
- Closing the Nest API gap against Model A is the highest-priority forward-port.
- UX Wave 3–4 work on the diverged branch is reimplemented on master, not cherry-picked as history.
- `industrial_ops_records` is deprecated and must not reappear in production migrations.
