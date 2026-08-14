# FORGE-INDUSTRIAL-MODEL-A-PRODUCTION-DEPLOY-S1

**Status:** COMPLETE  
**Source commit:** `576c564` (`industrial/model-reconciliation-s1`)  
**Pre-deploy production API:** `forge-production-ecs-platform-api:19`  
**Post-deploy production API:** `forge-production-ecs-platform-api:20`  
**Image tag:** `onboarding-closeout-20260814161717`  
**Schema:** Model A already live — **no migrations run**  
**Model B:** NOT deployed / NOT created  
**Industrial FE:** production S3 sync + CloudFront invalidation `IC3OCNP9BSNM8MXXNTCJ7JJNLQ`

## Smoke
| Check | Result |
|-------|--------|
| `GET /health` (API) | 200 |
| `GET https://industrial.forgepublicsafety.com/` | 200 |
| Unauth `GET /api/v1/industrial/readiness` | 401 (route present) |

## Scope completed
1. platform-api image build/push + ECS roll to `:20`
2. industrial-web static production sync
3. Public smoke above

## Out of scope / next
- Full authenticated UAT journeys (login as tenant user)
- Messaging / seasonal DDL (still CONDITION from completion sprint)
