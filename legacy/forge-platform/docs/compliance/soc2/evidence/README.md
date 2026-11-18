# Evidence

Collected artifacts demonstrating control operation. **No secrets, credentials, raw production PII, or unredacted customer records.**

## Subfolders

| Path         | Contents                                               |
| ------------ | ------------------------------------------------------ |
| `access/`    | Access review exports (redacted), provisioning samples |
| `change/`    | PR samples, CI gate results, deploy records            |
| `logging/`   | CloudTrail / CloudWatch evidence (redacted)            |
| `testing/`   | RLS, isolation, header, security scan outputs          |
| `vendors/`   | AWS Artifact review checklists                         |
| `incidents/` | Post-incident timelines (redacted)                     |
| `backups/`   | Backup job status, restore drill reports               |
| `training/`  | Completion attestations                                |

## Naming convention

```text
YYYY-MM-DD_<control-id>_<short-description>.md|pdf|png|json
```

Example: `2026-07-26_CC-ISO-03_playwright-isolation-pass.md`

## Automation goal

Prefer scripts that write **redacted** summaries here (or to an approved secure store with pointers here). Do not commit `.env`, secret values, or Cognito passwords.
