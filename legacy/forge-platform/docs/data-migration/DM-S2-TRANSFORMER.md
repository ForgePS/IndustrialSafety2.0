# DM-S2 Transformer

Package: `@forge/data-migration-transformer`  
Path: `tools/data-migration/transformer/`

## Purpose

Read-only transform of the immutable DM-S1 Firebase logical extract into an immutable AWS import package.

**Does not:** write Aurora, write customer production S3, create Cognito users, or mutate Firebase.

## Run

```bash
pnpm migration:transform -- --input .tmp-data-migration/dm-s1/migration-package --output .tmp-data-migration/dm-s2/aws-import-run
```

## Outputs (`aws-import/`)

- `manifest.json` — run id, git SHA, tool version, checksums, gates
- `*.ndjson` — target entity files (including `archive-*` and `excluded-*`)
- `id-map.ndjson` — source↔target traceability (idempotent target IDs)
- `errors.ndjson` — fatal/warn records

## Type support

Normalizes extractor markers: Timestamp, GeoPoint, DocumentReference, Bytes, Integer, Double, arrays, maps, null, boolean.
