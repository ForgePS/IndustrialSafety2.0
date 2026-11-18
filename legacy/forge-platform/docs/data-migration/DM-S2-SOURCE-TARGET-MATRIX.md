# DM-S2 Source → Target Matrix

**Rule:** All 80 Firebase root collections have a final disposition. `UNKNOWN` is not allowed.

**Code SoT:** `tools/data-migration/transformer/src/source-target-matrix.ts`

## Disposition summary

| Disposition                        | Count (approx intent)                           |
| ---------------------------------- | ----------------------------------------------- |
| TRANSFORM / MERGE / SPLIT / DIRECT | Operational industrial + platform identity      |
| GLOBAL                             | EHS templates, platform settings                |
| ARCHIVE                            | Schema gaps, high-volume audit, tooling residue |
| EXCLUDE_WITH_APPROVAL              | Billing, messaging, platform ops                |

## UNKNOWN_SOURCE_TARGET_MAPPINGS

**0** (verified by transformer unit tests + transform run).

## Notes

- Gap collections use disposition `ARCHIVE` with `implementationStatus: MISSING` so the transformer has a known target without inventing Aurora tables.
- Customer import of READY entities still requires tip DDL + separate AWS import authorization.
