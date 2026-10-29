# PROD-S0R — Outbound email readiness (SES + Resend)

**Account:** `511343547817` · **Region:** `us-east-1`  
**Active production provider (Compute):** **Resend** (`FORGE_EMAIL_PROVIDER=resend`)  
**From address:** `noreply@forgepublicsafety.com`  
**SES send domain (legacy / future):** `mail.forgepublicsafety.com`  
**Bulk customer mail:** NOT AUTHORIZED

## Current production path — Resend

Platform API tasks are configured for Resend so scheduled reports (including monthly Safety Supplies department email) can leave the SES sandbox blocker.

| Item           | Value                                                       |
| -------------- | ----------------------------------------------------------- |
| Provider       | `resend`                                                    |
| From           | `noreply@forgepublicsafety.com`                             |
| API key secret | `forge-<env>-secrets-resend-api-key` → env `RESEND_API_KEY` |

**Ops steps (required before first real send):**

1. Verify `forgepublicsafety.com` (or the exact from address) in the Resend dashboard, including DNS records Resend requires.
2. Create the secret and store the API key (PowerShell one-liner; do **not** paste keys into chat or git):

```powershell
aws secretsmanager create-secret --profile forge-dev --region us-east-1 --name forge-production-secrets-resend-api-key --description "Resend.com API key for platform outbound email" --secret-string "paste-your-real-resend-key-here"
```

If the secret already exists, use `put-secret-value` instead of `create-secret`.

3. Deploy Compute so the API task mounts `RESEND_API_KEY` from that secret name (`forge-<env>-secrets-resend-api-key`).
4. Force a new API task deployment if the secret value changed after the service was already running.
5. Confirm at least one Safety Director membership has a real inbox address, then use Reporting → Scheduled / Settings as needed.

Local/dev still defaults to `noop` when `FORGE_EMAIL_PROVIDER` is unset.

## SES posture (retained for future)

| Check                              | Result                        |
| ---------------------------------- | ----------------------------- |
| Sending enabled                    | true                          |
| Production access (out of sandbox) | **false — still SES sandbox** |
| Enforcement                        | HEALTHY                       |

SES code path (`FORGE_EMAIL_PROVIDER=ses` + `ses:SendEmail` IAM) remains available. Switching back requires verified domain identity / DKIM for `mail.forgepublicsafety.com` and SES production access.

## Classification

**Outbound email = READY WITH CONDITIONS (Resend)**

Conditions:

- Domain verified in Resend for `forgepublicsafety.com`.
- Real Resend API key stored in Secrets Manager (secret created by CDK with a generated placeholder until replaced).
- Compute redeployed with `FORGE_EMAIL_PROVIDER=resend`.
