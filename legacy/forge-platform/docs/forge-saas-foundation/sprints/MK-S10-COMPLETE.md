# MK-S10 Complete — Billing UX / Enterprise Contracts

**Program:** FORGE-SAAS-CORE  
**Sprint:** MK-S10  
**Completed:** 2026-08-10  
**Verdict:** PASS  
**Repair passes used:** 0

## Objective achieved

Creator and Tenant Admin billing surfaces sit on MK-S9 APIs: overview, invoices, contact, manual contracts with dates/fees/pricing JSON; mutations audited; portal stubbed.

## Scope completed

- Overview / customer GET-PATCH / invoices GET / contract PATCH + `pricing_json`
- Permission `tenant.billing.read` (seed + owner/admin templates)
- Creator `/billing`; Tenant Admin `/billing`
- Migration `0031_mk_s10_billing_ux.sql` (not applied prod)
- BILLING.md UX section

## Out of scope honored

- Live Stripe Customer Portal
- MK-S11 Creator redesign
- Production ops

## Verification

| Check                                           | Result   |
| ----------------------------------------------- | -------- |
| contracts billing tests                         | 5 passed |
| billing service unit                            | 6 passed |
| platform-api / creator / tenant-admin typecheck | PASS     |
| Production operations                           | NONE     |

## Next sprint

NOT AUTHORIZED.
