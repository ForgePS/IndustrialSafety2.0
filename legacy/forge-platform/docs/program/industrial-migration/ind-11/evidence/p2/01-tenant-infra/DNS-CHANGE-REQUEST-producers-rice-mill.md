# DNS change request — Producers Industrial (dark → cutover)

**Date:** 2026-08-05  
**Status:** REQUEST READY — do not publish to end users until Phase 5 cutover window  
**AWS account:** `511343547817` (development / staging-prod path)  
**Requester:** Forge Industrial P2 (Producers AWS-primary pilot)

## Ask

Create a **CNAME** (or Route53 alias if you later move the zone into this account) for:

| Field | Value |
| --- | --- |
| Name / host | `producers-rice-mill.forgepublicsafety.com` |
| Type | `CNAME` (or ALIAS/A→CloudFront if supported) |
| Target / value | `d2ed3566n8x2gi.cloudfront.net` |
| TTL | 300 seconds during cutover window (raise after stable) |

## Why this host (not nested)

ACM certificate already issued:

- `forgepublicsafety.com`
- `*.forgepublicsafety.com`

That wildcard covers **one** label (`producers-rice-mill.forgepublicsafety.com`).  
It does **not** cover `producers-rice-mill.industrial.forgepublicsafety.com`.

## Already completed in AWS (dark)

| Item | State |
| --- | --- |
| CloudFront distribution | `EXIC8HBMJ4I2Z` |
| CF alias | `producers-rice-mill.forgepublicsafety.com` **added** |
| ACM on distribution | `arn:aws:acm:us-east-1:511343547817:certificate/ca267baa-304e-4ffd-be51-7350abab0c3f` |
| Cognito Industrial client callbacks | Include `https://producers-rice-mill.forgepublicsafety.com/auth/callback/` |
| Cognito logout URLs | Include `https://producers-rice-mill.forgepublicsafety.com/` |

Evidence: `docs/program/industrial-migration/ind-11/evidence/p2/01-tenant-infra/dns-producers-rice-mill-dark.json`

## Timing

| When | Action |
| --- | --- |
| Now | **CNAME applied and verified** (2026-08-05) — resolves to Industrial CF; pre-announce until Phase 5 |
| Phase 5 cutover | Announce URL to Producers operators; Cognito primary login |
| Rollback | Remove or lower-TTL flip CNAME away; Firebase remains fallback until P2 exit |

## Validation after DNS live

```text
nslookup producers-rice-mill.forgepublicsafety.com
curl -I https://producers-rice-mill.forgepublicsafety.com/
# Expect CloudFront + ACM; Industrial shell (sign-in), not NXDOMAIN
```

## Note on Route53

Account `511343547817` currently has **no** Route53 hosted zone for `forgepublicsafety.com`.  
This change must be applied where that zone is actually managed (registrar DNS, another AWS account, Cloudflare, etc.).

## Contacts

| Role | Name | When to escalate |
| --- | --- | --- |
| Program Owner | Jeremy | Cutover / rollback authority |
| DNS zone owner | TBD | Fill before sending |
| Platform / ops | TBD | Fill before sending |

## References

- Plan: `56-producers-p2-execution-plan.md`  
- Auth: `evidence/p2/00-authorization/APPROVE-PRODUCERS-AWS-PRIMARY-PILOT.md`  
- Prep: `57-producers-p2-phase1-prep.md`  
