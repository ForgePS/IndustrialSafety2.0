# FX Migration Strategy

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (planning)  
**Author:** Forge Experience Program  
**Last Updated:** 2026-07-30

## Purpose

Plan safe migration onto FX without big-bang production risk.

## Scope

UI/UX adoption only after FX approval + platform stabilization. No backend rewrites as part of FX migration.

## Goals

- RMS reference implementation first
- Strangle legacy UI module-by-module
- Preserve auth, tenancy, APIs

## Strategy

1. **Inventory** product screens vs FX patterns (gap analysis).
2. **Stand up** shared FX UI package consuming tokens (post-approval).
3. **Adopt in RMS** high-traffic shells/workspaces as reference.
4. **Migrate Academy** reusing RMS/FX components.
5. **Migrate Industrial Safety** same.
6. **Default** new apps to FX.

## Non-goals

- Replacing auth, search, notification, or workflow engines in FX-S0
- Parallel permanent design systems

## Risks

See [34-risk-register.md](./34-risk-register.md).

## Acceptance criteria

- [x] Phased migration order documented
- [x] Non-goals aligned to stop conditions

## Revision history

| Date       | Change  |
| ---------- | ------- |
| 2026-07-30 | Initial |

## Related

- [25-product-adoption.md](./25-product-adoption.md)
- [32-acceptance-and-stop-conditions.md](./32-acceptance-and-stop-conditions.md)
