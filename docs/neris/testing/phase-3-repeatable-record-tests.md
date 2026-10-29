# Phase 3 Repeatable Record Tests

## Automated (in repo)

| Area                                    | Coverage                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| Specialty engine + flag                 | `packages/neris/src/specialty-workflows.test.ts`, `specialty-workflows-flag.test.ts` |
| Feature flag default false              | Seed + access service default + docs                                                 |
| Unit / API / RLS / Playwright scenarios | Expand in CI as environments allow                                                   |

## Required deployed scenarios (checklist)

1. Structure fire with two exposures
2. Structure fire with civilian casualty
3. Structure fire with firefighter injury
4. Hazmat release with two substances and multiple containers
5. Alarm activation with impaired sprinkler system
6. Classification change after exposure data exists (values preserved; warn on hide)
7. Unauthorized casualty access denial
8. Cross-tenant attachment access denial
9. Finalized specialty-record edit rejection
10. Feature-disabled tenant denial

Phase 1 and Phase 2 regression suites must remain green.

## Evidence continuity

Retain PRs, migrations (`0011`), permission/RLS/attachment tests, CloudTrail/CloudWatch, deployments, and security scans. Do not deploy the Data stack while GAP-009 remains open.
