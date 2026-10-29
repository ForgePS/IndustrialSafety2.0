# FX-S2B Route Validation

**Date:** 2026-07-30

| Route               | In Next.js | In nav registry | Deep-link preserved |
| ------------------- | ---------- | --------------- | ------------------- |
| `/`                 | ✓          | ✓               | ✓                   |
| `/login/`           | ✓          | ✓ session       | ✓                   |
| `/auth/callback/`   | ✓          | non-nav         | ✓                   |
| `/select-tenant/`   | ✓          | ✓ session       | ✓                   |
| `/health/`          | ✓          | non-nav         | ✓                   |
| `/incidents/`       | ✓          | ✓               | ✓                   |
| `/incidents/new/`   | ✓          | ✓               | ✓                   |
| `/incidents/[id]/`  | ✓          | non-nav         | ✓ `?section=`       |
| `/review/`          | ✓          | ✓               | ✓                   |
| `/configuration/`   | ✓          | ✓               | ✓                   |
| `/cad/operations/`  | ✓          | ✓               | ✓                   |
| `/cad/conflicts/`   | ✓          | ✓               | ✓                   |
| `/cad/messages/`    | ✓          | ✓               | ✓                   |
| `/cad/connections/` | ✓          | ✓               | ✓                   |
| `/cad/unmapped/`    | ✓          | ✓               | ✓                   |
| `/cad/mappings/`    | ✓          | ✓               | ✓                   |

**Unaccounted routes:** 0
