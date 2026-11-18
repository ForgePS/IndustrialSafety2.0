# Environment Variables

All variables are documented in `.env.example`.

- `PUBLIC_*` values may be exposed to browsers.
- All other variables are **server-only**.
- Validation is centralized in `@forge/environment`.
- Production-like environments reject missing secrets, bad ARNs, insecure URLs, and unsupported partitions.
