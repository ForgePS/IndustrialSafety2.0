# Change Management

Records and templates for controlled changes to the Forge system.

## Standard path

```text
Issue / ticket → Pull request → CI gates → Review approval → Merge → Deploy → Verify
```

## Evidence sources (existing)

- GitHub pull requests and approvals
- GitHub Actions workflow runs (RLS, gitleaks, cdk-nag, tests)
- CDK deploy outputs / ECS task definition revisions

Templates → `templates/`  
Sample packs → `../evidence/change/`

Related controls: **CC-CHG-01..03**, **CC-CI-***

Formalize the written procedure without replacing the working GitHub + CI controls.
