# Search Migration Plan

**Document:** `12-search-migration.md`  
**Status:** PLANNED (phased)

## Principle

Local page filtering ≠ global search. Do not claim global search until indexed.

## Phases

1. Search shell / command interface (FX presentation)
2. Route + local-result adapters
3. Cross-module indexed search
4. Saved searches / advanced filters

## Security

Restricted records must never appear in suggestions, counts, or metadata without authorization.
