# CAD webhook security

## Endpoint

`POST /api/v1/cad/webhooks/:connectionPublicId`

Public (no Cognito). Authentication is HMAC-based per connection.

## Required headers (synthetic adapter)

| Header                   | Purpose              |
| ------------------------ | -------------------- |
| `X-Forge-CAD-Key-Id`     | Key id for rotation  |
| `X-Forge-CAD-Timestamp`  | Unix seconds (or ms) |
| `X-Forge-CAD-Nonce`      | Unique nonce         |
| `X-Forge-CAD-Message-Id` | Unique message id    |
| `X-Forge-CAD-Signature`  | Hex HMAC-SHA256      |

## Canonical string

```text
${timestamp}.${nonce}.${messageId}.${sha256Hex(body)}
```

`signature = hex(HMAC_SHA256(secret, canonical))`

Comparison uses constant-time equality on hex digests.

## Clock skew

Default tolerance: 300 seconds. Reject expired and future timestamps beyond skew.

## Replay prevention

Nonce and message id are stored in `cad_webhook_replay_cache` (tenant RLS) with expiry. Reuse returns generic `401 Unauthorized`.

## Secrets

- Secret **values** live in Secrets Manager (`webhook_secret_arn` / key rotation rows).
- Never store secret values in `configuration_json`.
- Local/dev only: `CAD_WEBHOOK_SECRET_OVERRIDES_JSON` maps `connectionPublicId` → secret.

## Acknowledgements

After successful persist + enqueue: HTTP `202` with `outcome: ACCEPTED` or `DUPLICATE`. Authentication failures return generic unauthorized responses (no payload logging).

## Feature flags

Requires both `rms.cad.enabled` and `rms.cad.webhook.enabled` for the connection tenant.
