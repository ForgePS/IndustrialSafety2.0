# PROD-S0R — WAF readiness

## ALB (REGIONAL) WebACL

Implemented in `forge-ecs.ts` when `features.enableWaf` (production: true):

| Priority | Rule                                  | Action                |
| -------- | ------------------------------------- | --------------------- |
| 0        | AWSManagedRulesAmazonIpReputationList | managed none override |
| 1        | AWSManagedRulesCommonRuleSet          | managed none override |
| 2        | AWSManagedRulesKnownBadInputsRuleSet  | managed none override |
| 3        | RateLimitPerIp (2000/5min)            | block                 |

**Deploy status:** WebACL associates to ALB only when `Forge-Production-Compute` is deployed. Compute is **not** authorized in PROD-S0R → ACL not yet live.

Observability log group `/forge/production/waf` exists; WAF logging association still deferred to Compute deploy.

## CloudFront WAF

Not yet authored as a dedicated CLOUDFRONT-scope WebACL. Default CloudFront distributions (when Frontend/Compute deploy) currently lack custom aliases and CF WAF.

## Classification

**WAF = READY WITH CONDITIONS**

Conditions:

1. Deploy Compute to materialize ALB WebACL + association (PROD-S1).
2. Author/associate CloudFront WebACL before custom-domain edge cutover.
3. Validate rate limit / managed-rule false positives in non-prod traffic before tightening.
