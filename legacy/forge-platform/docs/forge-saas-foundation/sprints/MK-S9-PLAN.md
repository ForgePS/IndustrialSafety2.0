# MK-S9 Plan — Billing Domain

## Objective

Create a provider-neutral Forge billing architecture: logical models, billing types, and webhook ingest that never bypasses entitlement rules.

## Current State

- `subscription_plans`, `subscriptions`, `subscription_events` exist with `billingProvider=NONE`.
- Status enums drift between ADR-019 SaaS labels and operational DB values (`TRIAL`/`GRACE`/`CANCELED`).
- No billing customer, price, items, invoice metadata, orders, contracts, fee lines, or provider webhook inbox.
- No live Stripe (BACKLOG-003).

## Reuse

- SubscriptionsService / EntitlementsService / ADR-017 entitlement SoT
- Outbox + audit + `@Idempotent`
- CAD webhook patterns for signature + replay ideas

## Changes Required

1. `billing-domain.ts`: models, billing types, providers, status normalizer, webhook payload schema.
2. Additive migration `0030_mk_s9_billing_domain.sql` + Drizzle schema.
3. `BillingService` for customer/contract/order/invoice/fee recording.
4. Stub webhook controller: signature verify, unique external event id, retry-safe; applies subscription/entitlement changes only through domain services.
5. Unit tests: status map, duplicate webhook, signature fail, webhook cannot unlock module without EntitlementsService.
6. `BILLING.md`; BACKLOG-003 note that live PSP is deferred.

## Out of Scope

- Live Stripe adapter / production secrets
- MK-S10 billing UX
- Seat enforcement at login (BACKLOG-014)
- Production migration apply

## PASS

Logical models exist; billing types enumerated; webhook requirements met with stub provider; entitlement bypass forbidden by design and test.
