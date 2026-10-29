# Industrial Training Quiz Module

FiredUp-style safety training inside Forge Industrial (Nest + Aurora + industrial-web).

## Routes

- UI: `/modules/training/`
- API: `/api/v1/industrial/training/*`
- Bootstrap: `/api/v1/industrial/bootstrap`

## Migration

Apply `packages/database/drizzle/0042_industrial_training_quiz_s1.sql` via the normal database migrate path.

## Seed demo content

```bash
DATABASE_SECRET_ARN=... FORGE_TRAINING_SEED_TENANT_ID=<tenant-uuid> \
  node scripts/seed-industrial-training-demo.mjs
```

Seeds original LOTO + Confined Space practice questions (Forge-authored).

## Smoke checklist

1. Sign in to industrial-web with `industrial.training.view` (+ manage for Author).
2. Open Training → Author → create source/chapter/question → Publish.
3. Library → select chapters → Start quiz (Standard and Adaptive).
4. Answer, bookmark, complete → Results → Retake wrong.
5. Progress tab shows stats; Records tab lists migrated completions.
