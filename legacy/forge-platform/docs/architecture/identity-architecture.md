# Identity architecture (infra baseline)

- Cognito user pool, email sign-in, strong password policy, MFA optional (dev)
- Separate clients: academy-web, rms-web, creator-console, department-portal, student-portal
- Auth code + PKCE; no client secrets for browser apps
- Authorization remains application/database RBAC (not Cognito groups alone)
- Hosted UI domain prefix: `forge-{env}-{accountSuffix}`
