# Sprint 1C Deployment Completion — Blockers

**Date:** 2026-07-25  
**Status:** STOPPED — do not bootstrap or deploy until blockers below are cleared  
**Directive:** `Forge AWS Rebuild — Sprint 1C Deployment Completion.pdf`

## Operator prerequisite check

| Tool       | Required              | Result                               |
| ---------- | --------------------- | ------------------------------------ |
| Node.js    | Matches repo (`>=20`) | **PASS** — `v20.20.2`                |
| pnpm       | `10.12.1`             | **PASS** — `10.12.1`                 |
| Docker     | Installed and running | **FAIL** — not installed             |
| AWS CLI v2 | Installed and on PATH | **PARTIAL** — installed, not on PATH |

### Docker (hard stop)

- `docker` is not on PATH.
- `C:\Program Files\Docker\Docker\Docker Desktop.exe` — **missing**
- `C:\Program Files\Docker\Docker\resources\bin\docker.exe` — **missing**
- `winget list --name Docker` — no installed package

**Exact blocker:** Docker Desktop is not installed on this workstation. ECS image assets (`ContainerImage.fromAsset`) and local image builds cannot run.

**Required action:** Install Docker Desktop for Windows, start the engine, confirm `docker --version` and `docker info` succeed. Do **not** change CDK to avoid Docker.

### AWS CLI (PATH only)

- Binary present: `%LocalAppData%\Programs\Amazon\AWSCLIV2\aws.exe`
- Version: `aws-cli/2.36.8`
- Winget package: `Amazon.AWSCLI 2.36.8.0`
- Shell PATH does **not** include the AWS CLI directory (`where.exe aws` fails)

**Required action:** Add `%LocalAppData%\Programs\Amazon\AWSCLIV2` to the user PATH (or reinstall AWS CLI so PATH is registered), then reopen the terminal.

Session workaround (does not replace PATH fix):

```powershell
$env:Path = "$env:LocalAppData\Programs\Amazon\AWSCLIV2;$env:Path"
aws --version
```

## AWS identity check

Command (via full path to AWS CLI):

```text
aws sts get-caller-identity
```

Result:

| Field     | Value                            |
| --------- | -------------------------------- |
| Account   | `511343547817`                   |
| UserId    | `511343547817`                   |
| Arn       | `arn:aws:iam::511343547817:root` |
| Partition | `aws` (commercial)               |

### Issues

1. **Root credentials** — directive forbids root for operator deployment. Use IAM Identity Center, an approved assumed role, or a short-lived profile instead.
2. **Account approval** — directive requires **explicit confirmation** that `511343547817` is the authorized Forge **development** account. Appearance in the credential chain is not approval.

## What will not be done until cleared

- CDK bootstrap
- Stack deploy
- ECR image publish
- Smoke tests against live ALB
- Weakening architecture to bypass Docker/root/account gates

## Clearance checklist (operator)

- [ ] Confirm: **Is AWS account `511343547817` authorized for Forge development deployment?** (yes/no; if no, provide the approved 12-digit account ID)
- [ ] Confirm Region: **`us-east-1`** (or state approved Region)
- [ ] Install and start **Docker Desktop**; `docker --version` works
- [ ] Put **AWS CLI v2** on PATH; `aws --version` works without full path
- [ ] Stop using **root**; authenticate as an approved non-root deployment identity
- [ ] Re-run `aws sts get-caller-identity` and paste Account + Arn (non-root)

After clearance, continue: app build → local Docker builds → infra validate/test/nag/synth → bootstrap → diff → deploy → smoke → inventory.
