# ADR-036 — HTTPS API delivery via CloudFront edge

- **Status:** Accepted
- **Date:** 2026-07-26
- **Sprint / Phase:** NERIS Phase 2 — Acceptance and Hardening

## Context

The deployed RMS web application is served over HTTPS via CloudFront. The Platform API Application Load Balancer remains HTTP-only until a Route 53 hosted zone is delegated and an ACM certificate can be attached (`edge.enableHttps`). Browser clients calling `http://…elb.amazonaws.com` from an HTTPS page produce mixed-content blocks and fail Phase 2 acceptance.

## Decision

1. Place a dedicated **API CloudFront distribution** in front of the existing internet-facing ALB (`ForgeApiCloudFront` / ADR-036).
2. **Viewer protocol:** HTTPS only (TLS 1.2+). Browsers never use HTTP to reach the API.
3. **Origin protocol:** HTTP to the ALB on port 80 until ALB ACM TLS is enabled. Origin traffic stays inside AWS between CloudFront and the ALB.
4. **Caching:** disabled for all API methods; forward authorization and idempotency headers.
5. **CORS:** allowlist exact HTTPS origins for RMS and Creator Console CloudFront domains (no production wildcards). Credentials allowed.
6. **Security headers:** HSTS, nosniff, frame deny, CORP `cross-origin` (required for cross-origin SPA → API), restrictive CSP on the API edge.
7. Application config uses environment-configured `PUBLIC_API_URL` / `NEXT_PUBLIC_API_URL` — never hard-coded CloudFront domains in application source.
8. When Route 53 + ACM are available, prefer enabling `edge.enableHttps` on the ALB and optionally keep CloudFront as a WAF/caching edge; until then CloudFront is the browser-facing HTTPS termination.

## Consequences

- Phase 2 browser acceptance can proceed without waiting on DNS delegation.
- Cognito Hosted UI + SPA call `https://{ApiHttpsDomain}/api/…` without mixed content.
- ALB DNS remains an origin-only endpoint and must not be documented as the browser API URL.
- Custom domain cutover later updates Cognito callback URLs and `NEXT_PUBLIC_*` build env without changing this architecture.

## References

- Construct: `infrastructure/cdk/lib/constructs/forge-api-cloudfront.ts`
- Related: ADR-025 (edge TLS and DNS), ADR-026 (static hosting headers)
