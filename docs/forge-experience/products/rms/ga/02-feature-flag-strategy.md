# 02 — Feature Flag Strategy (GA)

**Status:** **DRAFT — BLOCKED pending pilot**

## Current production posture (mandatory until GA approval)

```text
fx.rms.* global defaults = false
```

Enablement today: **tenant `feature_overrides` only**.

## Precedence (unchanged)

user → org → tenant override → definition default

## GA strategies (choose at approval time)

| Strategy                   | Description                                         | Risk                                  |
| -------------------------- | --------------------------------------------------- | ------------------------------------- |
| A — Cohort overrides       | Keep defaults false; override approved tenants      | Lowest                                |
| B — Default-on foundations | Flip foundation defaults true; modules via override | Medium                                |
| C — Default-on modules     | Flip module defaults true                           | Highest — requires strongest evidence |

**Recommendation until proven otherwise:** Strategy A for GA entry; reconsider B/C only after soak.

## Never

- Enable FX via platform-admin wildcard (FX resolvers already ignore this)
- Use env/`sessionStorage` overrides in production
- Flip defaults without checklist `03-global-enable-checklist.md`

## Keys

Foundations: `shell`, `navigation`, `workspace`, `forms`, `tables` (+ optional `dashboard`)  
Modules: `incidents`, `incidentReview`, `cadMessages`, `cadConflicts`, `nerisConfiguration`, `administration`, `utilities`, `cadConnections`
