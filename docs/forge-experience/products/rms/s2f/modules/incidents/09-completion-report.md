# FX-S2F Module Checkpoint — Incidents

**Date:** 2026-07-30  
**Module:** Incidents (S2F-1)  
**Reference:** Forge Experience Design System v1.0.0-RC1

## Decision requested

```text
APPROVE NEXT S2F MODULE
```

Alternates: `APPROVE WITH CONDITIONS` · `RETURN FOR CORRECTION`

### Suggested conditions

1. Capture pilot screenshots under `s2f/evidence/screenshots/` before tenant enablement.
2. Keep `fx.rms.module.incidents.enabled` default-off.
3. Do not start S2F-2 until this checkpoint is accepted (DEC-S2F-003).

## Scope completed

- S2F documentation structure
- Central module-flag resolver + diagnostics
- Seeded all module flags (default false)
- Wired Incidents list / new / workspace behind `fx.rms.module.incidents.enabled` + foundations
- Legacy paths preserved
- Incident baseline, plans, parity, rollback docs

## Routes validated

`/incidents/`, `/incidents/new/`, `/incidents/[id]/?section=` — unchanged URLs.

## Feature flags

| Flag                              | Default | Role        |
| --------------------------------- | ------- | ----------- |
| `fx.rms.module.incidents.enabled` | false   | Module gate |
| `fx.rms.tables.enabled`           | false   | List FX     |
| `fx.rms.forms.enabled`            | false   | New FX      |
| `fx.rms.workspace.enabled`        | false   | Detail FX   |

## Regression results

Module resolver unit tests pass (default off, admin ignore, env override, foundation matrix).

## Payload parity

Create/list/load/patch handlers unchanged — FX branch is chrome only.

## Permissions

Existing FeatureGates unchanged; module flag does not grant access.

## Tenant isolation

No change to tenant-scoped API calls or identifiers in UI.

## Accessibility

Uses S2D/S2E FX chrome a11y patterns when FX surfaces active; FieldRenderer remains legacy compat.

## Responsive validation

Foundation responsive CSS applies when FX surfaces active; legacy CSS otherwise.

## Rollback

Module flag off → all incident surfaces legacy immediately.

## Defects

| Sev | Count                                                  |
| --- | ------------------------------------------------------ |
| P0  | 0                                                      |
| P1  | 0                                                      |
| P3  | Screenshot package pending; FieldRenderer still legacy |

## Risks

See `../../12-risk-register.md` (R-S2F-001–004).

## Evidence

`08-evidence.md` + unit tests.

## Recommendation

**APPROVE NEXT S2F MODULE** (S2F-2 Incident Review) after conditions, or approve with screenshot condition.

---

**STOP:** S2F-2+ not started per authorization.
