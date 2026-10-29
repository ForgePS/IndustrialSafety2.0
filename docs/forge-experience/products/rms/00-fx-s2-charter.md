# FX-S2 Charter — Forge RMS Migration

**Document:** `00-fx-s2-charter.md`  
**Phase:** FX-S2  
**Status:** APPROVED TO BEGIN (FX-S2A authorized)  
**Reference standard:** Forge Experience Design System `v1.0.0-RC1`  
**Date:** 2026-07-30

## Objective

Migrate Forge RMS presentation to shared FX packages while preserving production functionality, permissions, records, workflows, integrations, and tenant isolation.

## Ownership

| Concern                                 | Owner                                        |
| --------------------------------------- | -------------------------------------------- |
| Shared presentation / interaction       | Forge Experience (`@forge/fx-*`)             |
| Business logic, APIs, NERIS, CAD, authZ | Forge RMS / Platform API                     |
| Feature flags / entitlements            | Platform feature-flag & entitlement services |
| Creator Console / Tenant Admin          | Out of scope (do not replace)                |

## Authorized packages

`@forge/fx-design-tokens`, `@forge/fx-ui`, `@forge/fx-layouts`, `@forge/fx-hooks`, `@forge/fx-icons`, `@forge/fx-patterns`, `@forge/fx-utils`

New shared packages require FX governance approval before use.

## Migration type

Controlled, incremental, reversible, tested, evidence-based (strangler pattern). Not an uncontrolled rewrite.

## Phase gates

| Gate   | Focus                             | Visible production change       |
| ------ | --------------------------------- | ------------------------------- |
| FX-S2A | Inventory & compatibility         | **No**                          |
| FX-S2B | Shell & navigation                | Flagged only after S2A approval |
| FX-S2C | Dashboards                        | Flagged                         |
| FX-S2D | Record workspaces                 | Flagged                         |
| FX-S2E | Forms & tables                    | Flagged                         |
| FX-S2F | Operational modules               | Flagged                         |
| FX-S2G | Stabilization & legacy retirement | After acceptance                |

## Hard restrictions (summary)

Do not modify authentication, tenant resolution, authorization strength, schemas without separate approval, NERIS submission behavior, incident validation rules, billing/subscription, or remove routes/functionality before acceptance. Do not hard-code styles or duplicate FX components inside RMS.

## Immediate authorization

**FX-S2A only.** Shell replacement and visible migration require a separate formal approval of the S2A completion report.
