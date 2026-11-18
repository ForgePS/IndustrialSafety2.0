# Duplicate module report (MODULE-CATALOG-S2)

## Summary

Duplicate **display names** across platforms are expected when implementations differ.
Duplicate **codes** are allowed only within different `product_id` scopes.
Flat Creator catalog UI previously mixed these and showed raw UUIDs.

| NAME                   | CODES                | PRODUCTS                                   | CLASSIFICATION                                  | ACTION                                          |
| ---------------------- | -------------------- | ------------------------------------------ | ----------------------------------------------- | ----------------------------------------------- |
| AI Narrative Assistant | AI_NARRATIVE         | FORGE_INDUSTRIAL, FORGE_RMS, FORGE_ACADEMY | INTENTIONAL_SHARED_MODULE (product-scoped rows) | Keep one row per product; UI groups by platform |
| Personnel              | PERSONNEL            | FORGE_INDUSTRIAL, FORGE_RMS                | PLATFORM_SPECIFIC_VARIANT                       | Keep both; never merge                          |
| Training               | TRAINING             | FORGE_INDUSTRIAL, FORGE_RMS                | PLATFORM_SPECIFIC_VARIANT                       | Keep both; never merge                          |
| Documents              | DOCUMENTS            | FORGE_INDUSTRIAL, FORGE_RMS                | PLATFORM_SPECIFIC_VARIANT                       | Keep both                                       |
| Core                   | CORE                 | all four products                          | PLATFORM_CORE per product                       | Keep; hide from customer toggles                |
| Reports / Reporting    | REPORTS vs REPORTING | RMS vs Industrial                          | PLATFORM_SPECIFIC_VARIANT                       | Different keys; not duplicates                  |

## Detailed classifications

### AI Narrative Assistant

- **Type:** INTENTIONAL_SHARED_MODULE (shared _capability_, separate catalog rows)
- **Not:** SAME_MODULE_DUPLICATE
- **Reason:** Each product may entitle AI narrative independently; schema uniqueness is `(product, code)`.
- **API:** Mutations require `productCode` when code is ambiguous.

### Personnel

- **Type:** PLATFORM_SPECIFIC_VARIANT
- **Industrial:** `FORGE_INDUSTRIAL:PERSONNEL` — industrial personnel workspace / API
- **RMS:** `FORGE_RMS:PERSONNEL` — fire-service personnel catalog concept
- **Action:** Do not merge. Creator shows each under its platform tab.

### Training

- **Type:** PLATFORM_SPECIFIC_VARIANT
- Same treatment as Personnel.

### Creator Core / Industrial Core / RMS Core / Academy Core

- **Type:** PLATFORM_CORE (not customer modules)
- Flat catalog previously listed all four as if sellable — **fixed** by hiding PLATFORM_CORE / CREATOR from Module Catalog customer view.

### Tenant Administration

- **Type:** INTERNAL_TOOL on FORGE_CREATOR
- Hidden from customer-assignable catalog.

## Orphans / legacy

| Item                              | Classification                                   | Notes                                                                        |
| --------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| Pre-S2 Industrial starter subset  | LEGACY_RECORD (superseded by full registry seed) | Seed upserts add missing Industrial modules; existing entitlements preserved |
| UUID shown as card disabledReason | MIGRATION_ARTIFACT (UI)                          | Removed from primary Module Catalog presentation                             |

## Assignment safety

- No tenant entitlement rows are deleted by catalog canonicalization.
- Expected reconciliation: `OLD_ASSIGNMENT_COUNT == NEW_ASSIGNMENT_COUNT` (difference 0) because module IDs are preserved; only new unused catalog rows are inserted.
