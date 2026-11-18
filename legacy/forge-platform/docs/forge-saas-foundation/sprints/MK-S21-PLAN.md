# MK-S21 Plan — Security Red Team

## Objective

Dedicated attack sprint against Forge SaaS isolation and authorization. Document findings in `MK-S21-security-review.md`. CRITICAL/HIGH must be resolved (max two repair passes). No production ops.

## Attack vectors

- Cross-tenant read / write
- URL / body tenant substitution
- Facility substitution
- Role escalation / hidden endpoint access
- Creator Console bypass
- Module entitlement bypass
- Suspended tenant bypass
- Removed member session reuse
- Expired / revoked invitation reuse
- Cross-tenant file access
- API key abuse / webhook replay

## Deliverable

`docs/forge-saas-foundation/MK-S21-security-review.md` with severity CRITICAL | HIGH | MEDIUM | LOW | INFO

## Out of scope

- Production penetration against live systems
- Industrial product red-team (unless SaaS control-plane shared path)
- Deploy / migrate
