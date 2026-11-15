# ADR-015: Permission-based authorization

**Status:** Accepted  
**Date:** 2026-07-25  
**Sprint:** 1D

## Context

Role names change and differ per tenant. Checking `if role === 'Admin'` couples code to labels and cannot express fine-grained or deny rules. Authorization must be stable across product modules.

## Decision

**Authorize on permission codes, not role names; deny overrides allow.**

1. Roles are bundles of permission codes (e.g. `workforce.person.read`); handlers check codes only.
2. Effective permissions = union of allows from assigned roles, then apply explicit denies; **deny wins**.
3. Missing permission is deny; do not infer access from role display name or hierarchy alone.
4. Permission catalog is versioned with the product; tenant role definitions map into that catalog.

## Consequences

- Stable API/guard logic when tenants rename or customize roles.
- Requires a maintained permission catalog and role-mapping UI/admin path.
- Deny-overrides-allow simplifies privileged “break glass” restrictions but needs careful deny assignment.
