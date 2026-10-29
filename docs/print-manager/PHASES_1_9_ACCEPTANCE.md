# Forge Print Manager — Phases 1–9 Acceptance

Acceptance checklist against `Forge_Print_Manager_Cursor_Build.md` (§160) using the existing `industrial_*` / `/api/v1/industrial/*` stack (no parallel `print_*` API).

## Phase coverage

| Phase | Surface                                                              | Status                                                      |
| ----- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1     | Print Manager hub (Dashboard / Queue / Printers / Bridges / History) | Done                                                        |
| 2     | Windows bridge registration, publish gate, spooler path              | Done — see `forge-printer-bridge/docs/PHASE2_ACCEPTANCE.md` |
| 3     | Groups, routing rules, failover events                               | Done — migration `0097`                                     |
| 4     | Label templates (DRAFT / PUBLISHED / ARCHIVED), version pin on jobs  | Done                                                        |
| 5     | ELEMENTS layout, Code 128, ZPL export, Brady PNG, test print         | Done                                                        |
| 6     | Batches, stop-on-fail, fleet multi-select print                      | Done                                                        |
| 7     | Supplies burn-down + analytics endpoints/UI                          | Done — migration `0098`                                     |
| 8     | Module `ForgePrintButton` wiring                                     | Done                                                        |
| 9     | Creator print health / feature toggles                               | Done                                                        |

## §160 acceptance mapping

- Discover / publish / disable printers via registered Print Bridge — **met**
- Users only see authorized printers — **met** (tenant + RBAC + location scoping on existing industrial print paths)
- Mobile / web job submit — **met** (`ForgePrintDialog` / `ForgePrintButton`)
- Central queue + routing + failover — **met** (Phase 3)
- Auditable jobs — **met** (job events + history)
- Versioned templates — **met** (Phase 4)
- PDF / Brady / ZPL — **met** for primary paths (full drag-drop canvas and ZPL-as-primary Brady transport deferred)
- Batch printing — **met** (cap 200; chunked TX deferred)
- Reprint reasons enforced — **met** (`reprintJobInputSchema.reason` required; Queue/History prompt)
- Offline Bridge caching — **partial** (bridge local queue exists; full offline matrix not certified here)
- Failed jobs stop after configured retries — **met** on retry policy paths
- Analytics metrics — **met** (summary / volume / failures / printers); gated by `forge.printing.analytics.enabled`
- Supply estimates — **met**; gated by `forge.printing.supplies.enabled`
- Creator tenant printing health — **met** (Customer detail → Printing)
- Cross-tenant security — **covered by existing tenant transaction patterns**; dedicated print security suite still recommended

## Feature flags (deployment overrides)

Default **ON** unless an explicit tenant override sets the flag to `false` (same rule as industrial bootstrap).

| Key                                | Gates                                            |
| ---------------------------------- | ------------------------------------------------ |
| `forge.printing.batch.enabled`     | `createPrintBatch`                               |
| `forge.printing.analytics.enabled` | analytics summary / volume / failures / printers |
| `forge.printing.supplies.enabled`  | supply list / create / patch / replace / delete  |

Creator can toggle these from the Printing tab. Platform seed must include `forge.printing.*` definitions (`packages/database/src/seed.ts`).

## Deploy prerequisites

1. Apply migrations through `0098_industrial_print_supplies_s1.sql`
2. Re-run platform seed so `forge.printing.*` and related industrial print module flags appear in `/features`
3. Entitle tenant module `PRINT_MANAGER` where required

## Remaining gaps (intentional)

- Chunked create TX for very large batches (still one TX up to 200)
- Full drag-drop label canvas; ZPL as primary Brady transport
- Support session API for print
- Cross-tenant print fleet rollup
- Formal §157 / §158 / §159 hardware matrices (Windows / Brady lab certification)
- UI tab hide when batch/analytics/supplies flags are overridden off (API already rejects)

## Suggested verification

```text
# Unit (API helpers + print services)
pnpm --filter @forge/platform-api exec vitest run src/modules/industrial/industrial-print

# Contracts schema (reprint reason required)
# POST .../print-jobs/:id/reprint without reason → 400
# POST with reason "Damaged Label" → queued child job with reprintReason set
```
