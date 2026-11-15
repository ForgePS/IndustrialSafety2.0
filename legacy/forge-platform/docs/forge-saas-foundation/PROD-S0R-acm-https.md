# PROD-S0R — ACM / HTTPS inventory

**Account:** `511343547817` · **Region for CloudFront certs:** `us-east-1`  
**Customer DNS / app routing changes:** NOT AUTHORIZED in PROD-S0R  
**edge.enableHttps:** remains `false` until ISSUED cert is wired to the Production edge and cutover is authorized

## Required production hostnames

| Role            | Hostname                           | Covered by existing cert SANs         |
| --------------- | ---------------------------------- | ------------------------------------- |
| Apex            | `forgepublicsafety.com`            | YES                                   |
| API             | `api.forgepublicsafety.com`        | YES (`*.forgepublicsafety.com`)       |
| Creator         | `creator.forgepublicsafety.com`    | YES                                   |
| Tenant Admin    | `admin.forgepublicsafety.com`      | YES                                   |
| Industrial      | `industrial.forgepublicsafety.com` | YES                                   |
| RMS             | `rms.forgepublicsafety.com`        | YES                                   |
| Academy         | `academy.forgepublicsafety.com`    | YES                                   |
| SES mail domain | `mail.forgepublicsafety.com`       | YES (TLS identity; SES DKIM separate) |

## Existing certificate (do not recreate)

| Field      | Value                                                                                 |
| ---------- | ------------------------------------------------------------------------------------- |
| ARN        | `arn:aws:acm:us-east-1:511343547817:certificate/ca267baa-304e-4ffd-be51-7350abab0c3f` |
| Status     | **ISSUED**                                                                            |
| Domain     | `forgepublicsafety.com`                                                               |
| SANs       | `forgepublicsafety.com`, `*.forgepublicsafety.com`                                    |
| Region     | `us-east-1` (CloudFront-compatible)                                                   |
| Validation | DNS — SUCCESS                                                                         |

### Validation CNAMEs (already satisfied; recorded for evidence)

| Name                                                       | Type  | Value                                                               |
| ---------------------------------------------------------- | ----- | ------------------------------------------------------------------- |
| `_c9ee6545e9c5aaab68c80d5f1eeca052.forgepublicsafety.com.` | CNAME | `_d78866a343b58532dc66b7abb5140693.jkddzztszm.acm-validations.aws.` |

Same record validates both apex and wildcard.

## Current associations

Certificate is **in use by Development** CloudFront distributions (`*-dev.forgepublicsafety.com` and coexistence host). That is ownership/validation proof — **not** production customer cutover.

## Route53 in account

No `forgepublicsafety.com` public hosted zone was found in account `511343547817` via `list-hosted-zones`. DNS for the domain appears to live outside this account (or in another account). **Do not invent external DNS changes.**

## Production wiring status

| Item                                     | Status                    |
| ---------------------------------------- | ------------------------- |
| Cert ISSUED with required SAN coverage   | PASS                      |
| `production.ts` records `certificateArn` | PASS                      |
| ALB HTTPS (`edge.enableHttps`)           | OFF (intentional)         |
| Production CloudFront aliases            | Not deployed              |
| Application A/AAAA/CNAME cutover         | NOT DONE / NOT AUTHORIZED |

## Classification

**ACM_HTTPS = READY WITH CONDITIONS**

Conditions:

1. Production edge must attach the ISSUED cert only after Compute/Frontend are authorized (PROD-S1+).
2. Application DNS routing records must remain untouched until cutover sprint.
3. Hosted-zone ownership / record installation for any _future_ ACM requests must be coordinated with external DNS operators if not using in-account Route53.
