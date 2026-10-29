# Forge RMS Web — Playwright E2E

Browser acceptance tests for **Forge RMS Phase 2** against a deployed environment (CloudFront static site + HTTPS API). Uses Cognito Hosted UI login and synthetic test data only.

## Prerequisites

- Node 20+
- pnpm 10+
- Chromium (installed via Playwright)

## Environment variables

| Variable                 | Required               | Description                                                                  |
| ------------------------ | ---------------------- | ---------------------------------------------------------------------------- |
| `E2E_BASE_URL`           | Yes (deployed)         | RMS CloudFront HTTPS URL, e.g. `https://d3ud5uzwd9js2z.cloudfront.net`       |
| `E2E_API_URL`            | Yes (deployed)         | Platform API HTTPS URL (CloudFront or ALB)                                   |
| `E2E_COGNITO_USERNAME`   | Yes                    | Cognito user for Hosted UI login                                             |
| `E2E_COGNITO_PASSWORD`   | Yes                    | Cognito password                                                             |
| `E2E_STORAGE_STATE`      | No                     | Path to reuse saved auth storage state (default: `.auth/storage-state.json`) |
| `E2E_COGNITO_USERNAME_2` | Required for isolation | Second tenant user for cross-tenant isolation tests                          |
| `E2E_COGNITO_PASSWORD_2` | Required for isolation | Second tenant password                                                       |

**Never commit credentials.** Use a local `.env` file (gitignored) or CI secrets.

## Install

From the monorepo root:

```bash
pnpm install
pnpm --filter @forge/rms-web-e2e install:browsers
```

## Run against deployed development

```bash
export E2E_BASE_URL="https://your-rms-cloudfront.example"
export E2E_API_URL="https://your-api-cloudfront.example"
export E2E_COGNITO_USERNAME="your-user@example.com"
export E2E_COGNITO_PASSWORD="your-password"

pnpm test:e2e:rms
```

Smoke subset:

```bash
pnpm --filter @forge/rms-web-e2e test:smoke
```

Interactive UI mode:

```bash
pnpm --filter @forge/rms-web-e2e test:ui
```

## Specs

| File                            | Coverage                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `tests/cognito-login.spec.ts`   | Cognito Hosted UI login → tenant select or home (`@smoke`)                              |
| `tests/manual-incident.spec.ts` | Create manual incident, overview station/shift, optional unit/classification (`@smoke`) |
| `tests/autosave.spec.ts`        | Autosave indicator, refresh persistence, dual-context conflict (`@smoke`)               |
| `tests/review-workflow.spec.ts` | Submit → return → correct → resubmit → approve → finalize → edit blocked                |
| `tests/isolation.spec.ts`       | Cross-tenant UI + API isolation; fails if secondary credentials missing (`@smoke`)      |
| `tests/mobile.spec.ts`          | 375×812 home + incidents smoke (`@smoke`)                                               |

Tests **skip gracefully** when `E2E_COGNITO_USERNAME` is unset (local CI without secrets).

## Projects

`playwright.config.ts` defines:

- **chromium** — desktop Chrome (all specs except mobile-only routing)
- **mobile-chrome** — Pixel 5 viewport 375×812 (`mobile.spec.ts`)

## CI

Optional workflow: `.github/workflows/rms-e2e.yml` (`workflow_dispatch`). Runs only when `E2E_COGNITO_USERNAME` secret is configured; does not fail main CI when secrets are missing.

Configure GitHub secrets: `E2E_BASE_URL`, `E2E_API_URL`, `E2E_COGNITO_USERNAME`, `E2E_COGNITO_PASSWORD`, and optionally `E2E_COGNITO_USERNAME_2`, `E2E_COGNITO_PASSWORD_2`.

## Notes

- Finalize is invoked via API (`POST .../finalize`) because the RMS UI does not yet expose a finalize button.
- All created data uses `[E2E synthetic ...]` markers for easy identification and cleanup.
- Reuse auth with `E2E_STORAGE_STATE=.auth/storage-state.json` after the first successful global setup run.
