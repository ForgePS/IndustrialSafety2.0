# Import Platform S8 — Security Headers

**Document:** `docs/testing/import-platform-s8-security-headers.md`  
**Date:** 2026-07-30  
**Status:** Edge headers **VERIFIED** (inspected); Playwright browser assertion pack **NOT_VERIFIED**

## API (platform API edge)

Observed response security headers:

| Header                     | Value / posture            |
| -------------------------- | -------------------------- |
| Strict-Transport-Security  | Present (HSTS)             |
| X-Content-Type-Options     | Present (XCTO)             |
| X-Frame-Options            | `DENY`                     |
| Referrer-Policy            | Present                    |
| Permissions-Policy         | Present                    |
| Cross-Origin-Opener-Policy | Present (COOP)             |
| Content-Security-Policy    | `default-src 'none'` (API) |

## Console / Tenant Admin (CloudFront / static apps)

| Directive     | Value / posture               |
| ------------- | ----------------------------- |
| `default-src` | `'self'`                      |
| `script-src`  | `'self' 'unsafe-inline'`      |
| `connect-src` | `'self' https:`               |
| `unsafe-eval` | **Absent** (no `unsafe-eval`) |

## Gaps

| Item                                                       | Status           |
| ---------------------------------------------------------- | ---------------- |
| Automated regression suite asserting headers every release | **NOT_VERIFIED** |
| Full CSP report-only / violation hunt                      | **NOT_VERIFIED** |

## Related

- Gap GAP-034 / DEF-S8-009
