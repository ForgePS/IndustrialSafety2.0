# Port slice 0: personnel foundation (Industrial 1.0 → 2.0)

First slice of the 1.0 → 2.0 port. It adds the organization structure and personnel fields later slices depend on (OSHA 301, workers' comp, DOT/fleet, training, scan/kiosk flows).

1.0 reference: `packages/database/src/schema/industrial.ts` (`industrial_departments`, `industrial_positions`, `industrial_employment_types`, `industrial_personnel`) and `apps/platform-api/src/modules/industrial/employee-number.ts`.

## What changed

| Area | 2.0 result |
| --- | --- |
| Departments | `forge_departments`: optional Location/Division, contact person, code, active flag. One active name per Location. |
| Positions | `forge_positions`: optional department (blank = company-wide). One active name per department. |
| Employment types | Lookup `personnel.employment_type` (full-time, part-time, seasonal, temporary, contractor) instead of a 1.0-style table, so tenants manage it in Lookups. |
| Personnel fields | Middle / preferred name, suffix, employment type, termination date, department, position, supervisor (a personnel record), company driver, DOT driver. Added to the Creator `personnel.profile` form. |
| Employee numbers | `employee_number_key` generated column, using 1.0 matching rules ("EMP-0042" = "emp 42" = "42"). Unique among active people. `forge_find_personnel_by_employee_number()` is service-role only and is meant for later scan/kiosk flows. |
| Sensitive data | `forge_personnel_sensitive`: date of birth, sex, home address. `forge_personnel_emergency_contacts`: up to 5, in priority order. Members have no RLS access to either table; access goes through `personnel.view_sensitive` / `personnel.edit_sensitive` plus record scope. The audit log records which fields changed, never their values. |
| Employment history | `forge_personnel_employment_events`, written by trigger on create, status, department, position, Location, Division, supervisor, archive and restore. |
| Tenant guards | Triggers reject cross-organization references, and positions from a different department. |
| Permissions | New: `personnel.configure` (Departments & Positions page) and `personnel.edit_sensitive`. Granted to safety-manager / company-admin templates and company-administrator / company-owner roles. |
| Security fix | `forge_personnel` previously let any member insert or update rows directly through PostgREST. Members are now read-only, matching other modules; app writes already used server actions. |
| UI | `/personnel/structure` (Departments & Positions); department, position and supervisor pickers on the profile form; Sensitive Information and Emergency Contacts panels; Employment History card; Department column on the list. |

## Not in this slice (from 1.0 personnel)

- Disciplinary actions (points, rescind, attachments)
- SMS consent log: belongs with Emergency Alerts
- PPE fields (prescription glasses / footwear): belong with Safety Supplies
- First aid / CPR certification expiry: belongs with Training
- Allergies / medical history: needs a privacy decision first
- Seasonal workforce metrics
- Department safety scores
- Supervisor cycle detection beyond self-supervision
- Syncing `supervisor_personnel_id` into the existing `supervisor_user_id` scope column

## Tests

```bash
node apps/web/tests/port-s0-personnel-structure-db.cjs
pnpm exec playwright test apps/web/tests/port-s0-personnel-structure.spec.cjs --reporter=line --workers=1
```

The DB test needs `apps/web/.env.local` pointing at a reset local stack. It covers 35 contract checks: key matching, cross-tenant guards, structure rules, history, sensitive-data isolation, and member direct-write denial.
