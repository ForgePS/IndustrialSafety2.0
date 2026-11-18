# MK-S10 Plan — Billing UX / Enterprise Contracts

## Objective

Tenant-facing billing overview and Creator contract/billing management on top of MK-S9 APIs. All mutations stay audited server-side. No live Stripe portal.

## Changes

1. API: overview GET, customer GET/PATCH, invoices GET, contract PATCH + `pricing_json`, `tenant.billing.read` for reads.
2. Creator `/billing` page: overview, contract editor (dates/renewal/setup/notes/pricing), invoices.
3. Tenant Admin `/billing` page: read-only overview + stub payment portal.
4. Docs update `BILLING.md`; seed permission.

## Out of scope

- Live Stripe Customer Portal
- MK-S11 Creator redesign
- Production migration apply
