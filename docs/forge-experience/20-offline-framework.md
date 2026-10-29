# FX Offline Framework

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 4)  
**Author:** Forge Experience Program  
**Last Updated:** 2026-07-30

## Purpose

Standardize offline capability UX across every Forge product so field users get one honest sync experience.

## Scope

Presentation of offline/degraded states, queued changes, conflict UI, retry, and sync indicators. Sync engines remain platform/product.

## Goals

- One offline experience for all products
- Users always know local-only vs committed
- Conflicts are visible and resolvable through shared patterns

## Definitions

| Term          | Meaning                                    |
| ------------- | ------------------------------------------ |
| Cached record | Locally available for view/edit per policy |
| Queued change | Pending upload to server                   |
| Conflict      | Server and local diverge                   |

## Responsibilities

| Owner            | Responsibility                                                   |
| ---------------- | ---------------------------------------------------------------- |
| FX               | Banners, indicators, conflict dialogs, queue lists, retry chrome |
| Platform/Product | Cache policy, conflict rules, transport, encryption at rest      |

## Required capabilities

| Capability                          | UX requirement                                                         |
| ----------------------------------- | ---------------------------------------------------------------------- |
| Cached records                      | Clear “available offline” affordance when applicable                   |
| Queued changes                      | Pending upload counter                                                 |
| Conflict detection                  | Surface conflict state; never silent overwrite in UI                   |
| Conflict resolution                 | Shared resolve pattern (keep local / keep server / merge when offered) |
| Automatic retry                     | Status visible; not silent forever                                     |
| Manual retry                        | Explicit action on failed items                                        |
| Sync status                         | Online / degraded / offline / syncing                                  |
| Last synchronized timestamp         | Visible in status bar / offline panel                                  |
| Pending upload counter              | Numeric, accessible                                                    |
| Failed upload queue                 | Dedicated list with retry                                              |
| Offline banner                      | Persistent while offline                                               |
| Connection restoration notification | Toast/banner when back online                                          |

## Rule

**No product shall invent its own offline experience.**

## Best practices

- Distinguish draft, queued, synced, failed
- Preserve layout when banners appear (Loading/Empty standards)
- Deep-link failed items to records when permitted

## Anti-patterns

- UI that looks identical online vs offline
- Hidden failed uploads
- Product-specific sync dialogs
- Auto-resolve conflicts without user visibility when policy requires choice

## Future enhancements

- Selective sync packs by module
- Bandwidth-aware media upload

## Dependencies

- Mobile Framework · Shell status bar · Record/Forms · Security UX

## Implementation notes

FX-S0 documents contracts only. No sync service replacement.

## Acceptance criteria

- [x] Capability list complete
- [x] Single-experience rule stated
- [x] Conflict/retry/status presentation defined

## Revision history

| Date       | Change                  |
| ---------- | ----------------------- |
| 2026-07-30 | Part 4 approved content |

## Related

- [19-mobile-framework.md](./19-mobile-framework.md)
- [08-application-shell.md](./08-application-shell.md)
- [15-forms-framework.md](./15-forms-framework.md)
