# GitHub OIDC deploy (development)

Workflow: `.github/workflows/deploy-development.yml`

Requires:

- IAM OIDC provider for GitHub
- Role trust on `repo:ORG/forge-platform:environment:development` (adjust)
- Secrets/vars: `AWS_DEPLOY_ROLE_ARN`, `AWS_ACCOUNT_ID`, `AWS_REGION`

Do not store long-lived access keys in GitHub.
