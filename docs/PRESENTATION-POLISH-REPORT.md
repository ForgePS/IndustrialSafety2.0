# Forge Industrial Safety Presentation Readiness

Polish pass focused on presentation-visible defects across Industrial web (Sneat Pro) for the **Producers Rice Mill** walkthrough. No redesign, schema, auth, tenant, or API contract changes.

## P0 Issues Found

1. Emergency Alerts dashboard could surface raw SMS provider config strings (`smsProvider=…`, `originationIdentity`, etc.).
2. Emergency Alerts treated successful SMS stub/dry-run notes as warning/error after send.
3. Compose defaults favored **live** alert + **SMS** channel (higher risk of unintended live SMS when a provider is enabled).

## P0 Issues Corrected

1. Dashboard SMS status copy is customer-facing; config keys are never shown.
2. Post-send SMS notes render as success/info notices, not failures.
3. Compose defaults to **drill** mode; SMS is off by default (IN_APP + MVIX remain). Confirm checkbox still required. Send button uses sentence case (“Send drill alert” / “Send alert”).

## P1 Issues Found

1. Fleet / Personnel / Workers’ Comp empty states shouting `DRIVERS` / `EMPLOYEES`.
2. Fleet tables and filters showing raw enums (`PASSENGER_VEHICLE`, `OUT_OF_SERVICE`).
3. Workers’ Comp “Visit date TBD” and raw case/workflow/work-status enums.
4. Dashboard insight cards: generic “No data recorded yet”; “Inspections by Site” vs Location terminology.
5. Module header eyebrows mismatched to registry groups (QR, Tasks, Messaging, Calendar, Reminders, Equipment, Fleet, DOT, Incidents, Emergency Response).
6. Verbose nav label “Department of Transportation Compliance”.
7. Dashboard attention labels missing apostrophe on Workers’ Comp.
8. QR description shouting `EMPLOYEES`.
9. Reminders “Process due now” ops jargon; weak empty copy on Tasks/Reminders.
10. Personnel permission denial exposed raw permission codes.
11. My Training / Training agency status badges ALL CAPS.
12. LOTO print dialog titles ALL CAPS.
13. Safety Supplies settings labeled “coming soon”.
14. Reporting share form “UUID” jargon.
15. Create CTA inconsistency (e.g. “New Report”, “Create equipment”, “New DRIVER”).

## P1 Issues Corrected

1. Empty states converted to sentence case across Fleet, Personnel drivers, Company Drivers, Workers’ Comp employees.
2. Fleet asset type / status labels humanized in filters, create form, and table badges; blank cells use “—”.
3. Workers’ Comp: `wcEnumLabel()` for statuses/workflows/work status; “Date not recorded”; employee column/empty copy cleaned.
4. Dashboard: contextual empty copy; “Inspections by Location”; Workers’ Comp attention labels corrected.
5. Eyebrows aligned to registry groups (`Incident & Claims`, `System Tools`, `Equipment & Operations`, `Compliance Programs`, `Emergency Management`).
6. Registry/display name shortened to **DOT Compliance** (analytics, reporting catalog, file breadcrumb, safety intelligence).
7. QR Management eyebrow + description polished.
8. Reminders: “Send due reminders”; empty vs filter messaging; System Tools eyebrow + accessible title id.
9. Tasks/Messaging/Calendar headers aligned; Tasks empty states distinguish search vs view vs empty list.
10. Personnel denial message no longer shows permission keys.
11. My Training and Training agency badges use sentence-case labels.
12. LOTO print titles: “Print label” / “Print N labels”.
13. Safety Supplies notification toggles: “not available yet”.
14. Reporting share field: “User to share with” (no UUID wording).
15. CTAs: “New incident”, “New asset” / “Create asset”, “New driver”.

## P2 Issues Corrected

- Emergency Alerts KPI labels (“Acknowledgments pending”, “—” instead of “n/a”).
- Fleet status filter label “Active (default)” instead of “Active-ish”.
- Equipment module description aligned to asset language.
- Dot new-driver form titles sentence-cased.

## Issues Deferred Until After Presentation

| Item                                                           | Priority | Notes                                                                       |
| -------------------------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| Full people-picker for Reporting share                         | P3       | Still accepts user id; needs directory picker UX                            |
| Reporting builder “Filters (JSON)” / customField placeholders  | P3       | Power-user surface; avoid mid-demo rewrite                                  |
| Uniform create-button verb across every module                 | P2/P3    | Top walkthrough CTAs aligned; remaining modules vary                        |
| OSHA display name shorten to “OSHA” only                       | P3       | “OSHA Recordkeeping” remains formal/correct                                 |
| Live browser walk of all 21 routes against Producers Rice Mill | P1 ops   | Requires authenticated demo environment; code polish complete               |
| Demo data content audit in Aurora for PRM                      | P1 ops   | Seed/import scripts exist; live data completeness not verified in this pass |
| Coming-soon modules still visible when entitled                | P2       | Clock icon pattern retained; hide per tenant if demo shows noise            |
| Sanitation / high-risk stub workspaces                         | P3       | Outside primary walkthrough                                                 |
| Nested scrollbar / micro-spacing passes                        | P2       | No structural layout bugs found in code audit                               |
| Field Version Facility→Location / Site→Division                | OK       | Field web conventions left intact                                           |

## Routes Tested

Code-path / static verification of presentation routes (loadability via App Router + workspace mapping):

1. Login / shell — reviewed (auth architecture unchanged)
2. Dashboard — empty/insight copy fixed
3. Personnel — empty/permission copy fixed
4. Training — status badge polish
5. My Training — status label polish
6. Incidents — header group + CTA
7. OSHA — registry name retained; workspace not structurally changed
8. Workers’ Compensation — enums, empty states, dates
9. Inspections — terminology via dashboard card
10. DOT Compliance — naming + CTA
11. Assets & Equipment — copy/CTA
12. Fleet — enums, empty states, drivers tab
13. Safety Supplies — settings copy
14. Lockout/Tagout — print titles
15. Emergency Alerts — demo-safe defaults + SMS copy
16. Tasks — empty states + eyebrow
17. Calendar — header consistency
18. Reminders — empty states + action label
19. Messaging — eyebrow
20. Reporting — share form copy; catalog module name
21. QR Management — eyebrow + description

**Live authenticated click-through** against Producers Rice Mill was **not** completed in this environment (no guaranteed local API/tenant session). Recommend a final human walk of the list above before leadership demo.

## Modules Tested

| Module                                                                            | Result           |
| --------------------------------------------------------------------------------- | ---------------- |
| People & Training (Personnel, Training, My Training)                              | Code polish PASS |
| Incident & Claims (Incidents, OSHA, Workers’ Comp)                                | Code polish PASS |
| Inspections & Operations (Inspections, DOT, Assets, Fleet, Safety Supplies, LOTO) | Code polish PASS |
| Communications (Emergency Alerts, Messaging)                                      | Code polish PASS |
| Productivity (Tasks, Calendar, Reminders)                                         | Code polish PASS |
| Administration (Reporting, QR Management)                                         | Code polish PASS |
| Dashboard                                                                         | Code polish PASS |

## Production Build

**WARN**

- `tsc --noEmit` for `@forge/industrial-web`: **PASS**
- `next build`: blocked in this environment by Windows `EPERM` on `apps/industrial-web/.next/trace` (file lock from concurrent Next processes / locked `.next` folder). No TypeScript compile errors were observed from the typecheck.

Re-run before demo (after stopping other Next processes):

```bash
pnpm --filter @forge/industrial-web build
```

If `.next` remains locked, delete `apps/industrial-web/.next` and rebuild.

## Authentication

**PASS** (architecture unchanged; no auth defects introduced). Live login not exercised in this pass.

## Tenant Isolation

**PASS** (no tenant/data-plane changes). Cross-tenant exposure not introduced.

## Console

**WARN** — Full DevTools walk not run against a live session. Avoidable UI jargon that previously looked like “console leftovers” was removed from Emergency Alerts and related surfaces.

## Responsive Check

**WARN** — Spot-checked via layout patterns (tables, headers, filters). Full 1920 / 1600 / 1366 / iPad landscape visual QA deferred to a short human pass.

## Presentation Readiness

**NEEDS ATTENTION**

Reason: P0 UI defects in Emergency Alerts were corrected in code, and high-visibility P1 polish landed, but:

1. Live Producers Rice Mill route walk + network/console verification is still required.
2. Production build must be confirmed clean on a machine without `.next` file locks.
3. Demo data population completeness for every walkthrough screen should be confirmed in the target environment.

Once the live walk and build succeed with no P0 defects, flip this status to **READY**.
