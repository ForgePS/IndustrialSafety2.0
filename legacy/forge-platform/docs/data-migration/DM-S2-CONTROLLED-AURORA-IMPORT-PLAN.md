# CONTROLLED-AURORA-IMPORT-S1 — Planned Sequence

**Status:** DOCUMENTED ONLY — **NOT AUTHORIZED** to execute.

1. Verify approved release SHA
2. Deploy production DDL (`0040_industrial_domain_s1` + prerequisites)
3. Verify production schema (tables, RLS FORCE, forge_app NOSUPERUSER/NOBYPASSRLS)
4. Create pre-import Aurora snapshot
5. Verify snapshot AVAILABLE
6. Run controlled Producers importer against import package V2
7. Reconcile DB counts vs id-map
8. Promote mapped files from staging `storage/source/` into authoritative customer documents bucket
9. Reconcile files
10. Map/create customer identities (separately authorized)
11. AWS-side application UAT
12. Leave Firebase active
13. Leave customer DNS unchanged

**Package:** `.tmp-data-migration/dm-s2/aws-import-run-v2/aws-import/` (gitignored)  
**Tenant:** `5da680d3-50f5-46ac-8b85-6cf454b6a0da` (`producers-rice-mill`)
