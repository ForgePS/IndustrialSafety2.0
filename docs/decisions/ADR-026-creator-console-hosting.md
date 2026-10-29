# ADR-026: Creator Console hosting on CloudFront and S3

**Status:** Accepted  
**Date:** 2026-07-25  
**Sprint:** 1E

## Context

The Creator Console is an internal single-page application that talks only to the platform API. It holds no server-side secrets and needs no server-side rendering. We need a hosting model that is cheap, secure by default, and simple to operate rather than one that carries the cost and surface of a running service.

## Decision

**Static export served from a private S3 bucket behind CloudFront with Origin Access Control.**

1. The Creator Console is built as a Next.js static export and served from a private S3 bucket behind CloudFront using Origin Access Control.
2. A response headers policy supplies HSTS, X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, and a Content-Security-Policy.
3. SPA routing is handled by a 403/404 rewrite to `/index.html`.
4. All data access is client-side against the platform API, so the console holds no server-side secrets.
5. Rejected alternative: an ECS Fargate service behind the existing ALB, which costs roughly ten times more per month and adds no capability the console needs.

## Consequences

- Cost is roughly $1/month instead of roughly $10/month.
- There is no server-side rendering or server-side session handling, so authentication state lives in the browser.
- **Cache strategy:** hashed `/_next/static/*` is long-cached (immutable `Cache-Control` + CloudFront `CachingOptimized` behavior). HTML shells use `CachingDisabled` / `max-age=0,must-revalidate`, so deploys invalidate entry shells (`/` and `/index.html`) rather than `/*` by default. Use `--full-invalidate` when rolling out CDN policy changes.
- **Compression:** CloudFront `compress: true` serves gzip/brotli; Network-panel transfer size is often far smaller than the S3 object size.
- The private bucket plus Origin Access Control means objects are never publicly readable except through CloudFront.
