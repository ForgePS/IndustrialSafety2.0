# ZIP Migration Bundle Validation (S4)

Validates ZIP archives for future migration imports. Does **not** execute imports.

## Requirements

- Valid ZIP package
- `manifest.json` present (`productNeutral: true`, `version`, `files[]`)
- Required files listed in manifest exist in archive
- Optional per-file SHA-256 verification (store-compressed entries)
- Supported extensions only: `.csv`, `.json`, `.xlsx`, `.xml`, `.txt`, `.md`

## API

`POST /api/v1/imports/zip/validate` with `{ "jobId": "..." }` after upload complete.
