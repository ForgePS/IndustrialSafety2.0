# MK-S22 Plan — End-to-End UAT

## Objective

Run the complete SaaS lifecycle UAT scenario (provision → entitle → invite → facility → roles → module toggle → billing → suspend/restore → notification → audit → isolation). Document evidence. No production ops.

## Approach

1. Prefer REUSE of existing platform-api e2e / security harnesses
2. Add a single lifecycle UAT script/test covering the 24 directive steps (API-level where UI is static-export limited)
3. Record viewport validation notes for Creator Console / Tenant Admin (supported sizes)
4. Docs `MK-S22-UAT.md` + sprint COMPLETE

## Out of scope

- Production traffic
- Industrial product UAT
- Live Cognito against AWS unless local harness already provides it
- Deploy / migrate
