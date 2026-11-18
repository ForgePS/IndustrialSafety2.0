# ADR-025: Edge TLS, DNS, and staged HTTPS enablement

**Status:** Accepted  
**Date:** 2026-07-25  
**Sprint:** 1E

## Context

The development environment currently serves the platform API over HTTP because the AWS account has no Route 53 hosted zone for `forgepublicsafety.com`. A DNS-validated ACM certificate cannot be issued until the zone exists and nameservers are delegated. We need the full HTTPS path to be built and reviewable now, without letting a deployment hang waiting on a certificate that cannot validate.

## Decision

**HTTPS is fully implemented in CDK but gated on a `domains` configuration block.**

1. When `domains.hostedZoneName` is set, the stack looks up the Route 53 public hosted zone, requests a DNS-validated ACM certificate, adds a 443 listener with the `ELBSecurityPolicy-TLS13-1-2-2021-06` policy, converts port 80 into a permanent redirect to 443, and creates alias A records plus a certificate-expiry alarm.
2. When the block is absent, the stack keeps the existing HTTP-only listener.
3. Development is deployed with the block absent because the AWS account currently has no hosted zone for `forgepublicsafety.com`.
4. Enabling HTTPS is a configuration change plus a nameserver delegation, not a code change.

## Consequences

- No deployment can hang on an unvalidatable certificate, because certificate issuance only runs when the domain block is present.
- The HTTPS path is reviewable and testable via CDK assertions before DNS exists, so the code is proven ahead of delegation.
- Cache invalidation and cutover reduce to setting the configuration block once the hosted zone is delegated.
- Risk: development traffic remains plaintext over the public internet until delegation. This is acceptable only for synthetic data and must not be used with real or sensitive data.
