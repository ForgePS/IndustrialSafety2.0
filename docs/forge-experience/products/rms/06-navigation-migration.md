# Navigation Migration Plan (FX-S2B)

**Document:** `06-navigation-migration.md`  
**Gate:** FX-S2B  
**Status:** IMPLEMENTED (default-off)  
**Decision:** DEC-S2-005 Controlled Hybrid — accepted

## Implementation

| Artifact | Path                                                    |
| -------- | ------------------------------------------------------- |
| Registry | `apps/rms-web/src/fx/navigation/navigation.registry.ts` |
| Adapter  | `apps/rms-web/src/fx/navigation/navigation.adapter.ts`  |
| Flags    | `fx.rms.navigation.enabled` (requires shell)            |

## Groups (live routes only)

- Home
- Incidents (list, create, review)
- CAD (operations, conflicts, messages, connections, unmapped, mappings)
- NERIS (configuration)
- Session (sign-in / switch tenant)

No Personnel, Fleet, Prevention, Training, or Scheduling groups.

## Behavior

- Product feature flags still gate capability items
- Secondary nav shows sibling items in the active group when FX nav is on
- Invalid combo `nav && !shell` forces legacy

## Exit criteria

See `27-fx-s2b-completion-report.md`.
