# Phase 4 parity evidence index

**Status:** STAGING LOAD + R3/R6 GREEN — UAT / twin still pending  
**Prep:** `../../63-producers-p2-phase4-prep.md`  
**Phase 3 exit:** `../../62-producers-p2-phase3-exit.md` **GREEN**  
**Freeze:** `s3://forge-development-imports-511343547817-us-east-1/ind11b/p4-staging/2026-08-06T15-15-28-618Z`

| Artifact | Purpose |
| --- | --- |
| `APPROVE-PRODUCERS-PHASE4-LOAD.md` | **SIGNED** — staging authorized; twin after UAT |
| `tenant-mapping-staging.json` | Q3 org → staging UUID |
| `extract-freeze-manifest.json` | Q2 remapped freeze + SHA256s |
| `extract-freeze-manifest-latest.json` | Pointer |
| `load-wave*-result.json` | R1 ECS load evidence per wave |
| `parity-counts-result.json` | R2 Aurora counts (staging) |
| `staging-load-summary.json` | Roll-up |
| `rls-isolation-result.json` | **R3 PASS** — forge_app FORCE RLS; no leak staging↔twin/A |
| `api-smoke-staging.json` | **R6 PASS** — day-1 list APIs on staging (dev-principal) |
| _(pending)_ UAT checklist / S2 | S package |
| _(pending)_ N4 URL rewrite | R4 |
| _(pending)_ twin load | T (blocked on S2) |
| _(pending)_ Phase 4 exit | U3 |
