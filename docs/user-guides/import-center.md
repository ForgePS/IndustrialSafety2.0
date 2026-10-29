# Import Center — User Guide

**Status:** Draft (architecture stop — UI not shipped yet)  
**Date:** 2026-07-28  
**Audience:** Tenant administrators, Configuration Managers, Platform Support

## What it is

The **Import Center** is Forge’s shared place to upload and import records for any product (Academy, RMS, Industrial, Creator operations). One engine serves every product.

Configuration Studio defines import **profiles**. The Import Center **runs** imports.

## High-level steps

1. Select **Product** → **Module** → **Record type**
2. Download a **template** (optional)
3. **Upload** a CSV, XLSX, JSON, or ZIP migration bundle
4. Confirm **column mapping** (from profile or manual)
5. **Resolve errors** shown per row (invalid rows are never silently dropped)
6. Review **duplicates** (Create / Update / Skip / Reject / Merge Review)
7. **Preview** counts and sample rows
8. **Approve** and **Execute**
9. **Monitor** progress
10. Download **results** / rejected-row export
11. **Rollback** only when the system marks the job as safely reversible

## Security notes

- Files upload directly to encrypted storage via a short-lived link.
- Malware scanning runs before the file is read.
- You can only import into your own tenant.

## Related docs

- Architecture: `docs/architecture/import-platform/`
- API: `docs/api/import-api.md`
- Operations: `docs/operations/import-platform.md`
