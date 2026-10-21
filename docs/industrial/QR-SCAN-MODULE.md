# QR Scan Module — Architecture & UAT

BASE_SHA: `ee7abb2a1665614f5e3e655d704271650be459f5`

## Architecture

```text
Physical QR → /scan/{opaqueToken}
  → GET /api/v1/public/scan/:token
  → qr_links (token hash) + action_config
  → asset / LOTO / JSA / document / training links
  → inspections / issues / OOS / history
```

### Data

- `qr_links` (+ `action_config`, access mode, target)
- `industrial_qr_link_scan_events`
- `industrial_qr_link_audit_events`
- Migration: `0065_industrial_qr_scan_s1.sql` (extends 0040)

### Admin

- `/modules/scan` and `/modules/qr-links` → QR Management
- Create/edit scan action toggles and linked LOTO/JSA/document/training/SDS
- Summary cards via `GET /api/v1/qr-links/analytics`
- Equipment → **QR & mobile access** panel

### Printing

- Browser sticker: `lib/qr-link-sticker.ts`
- Adapter layer: `lib/label-print.ts` (`browser` | `pdf` | `brady` stub)

## UAT checklist

### Happy path

1. Enable SCAN / QR_LINKS for tenant
2. Create equipment QR with employee-number access
3. Issue token, download/print sticker
4. Scan on phone → identify with employee number
5. Complete daily inspection (pass)
6. Confirm inspection + scan history + analytics increment

### Failure / OOS path

1. Fail critical inspection item
2. Confirm asset marked out of service when configured
3. Scan shows DO NOT OPERATE
4. Report issue → corrective action created
5. Authorized return to service

### Training path

1. Link training assignment on QR action config
2. Identify employee
3. Required training status appears
4. Start training → complete in Training Portal
5. Status reflects completion (no duplicate completion records)

### Security path

1. Tenant A token against Tenant B context → NOT_FOUND / denied
2. Inactive / replaced token rejected
3. Unauthorized history / OOS denied
4. Raw DB ids not present in QR URL

## Production deploy

Not part of this implementation pass unless explicitly authorized.

CHECKPOINT: `FORGE-INDUSTRIAL-QR-S10` (implementation ready for UAT; deploy = NO until authorized)
