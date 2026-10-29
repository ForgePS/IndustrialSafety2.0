# Acceptance Criteria — FX-S2 RMS

**Document:** `26-acceptance-criteria.md`  
**Source:** FX-S2 authorization §30

FX-S2 complete when:

- Shell, navigation, dashboards, core workspaces, shared forms/tables use FX presentation
- My Work / search / notifications integrated **honestly** with supported capabilities
- Mobile/tablet + light/dark/HC validated
- A11y AA met; roles validated
- Flags + rollback tested
- Legacy retirement plan approved
- No unresolved P0; no unresolved migration P1
- Evidence complete; product-owner acceptance recorded

## FX-S2A–S2E gate acceptance

See respective completion reports. S2E adds:

- Shared forms + tables frameworks
- Existing forms/tables migrated behind flags
- `fx.rms.forms.enabled` / `fx.rms.tables.enabled` default false
- Validation/business logic/APIs/permissions unchanged
- Rollback to legacy presentation
