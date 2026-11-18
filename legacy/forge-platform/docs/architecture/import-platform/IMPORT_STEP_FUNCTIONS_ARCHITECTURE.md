# Import Step Functions Architecture (S5)

**Status:** `DEFINITION_COMPLETE_DEPLOYMENT_PENDING`

## Intent

ASL stages: LoadJob → ValidateExecutableState → AcquireExecutionLock → ResolveAdapter →
CreateOrResumeBatch → ProcessBatch → UpdateProgress → MoreRows? → FinalizeJob →
GenerateResults → ReleaseLock (+ HandleFailure).

CDK construct: `infrastructure/cdk/lib/constructs/forge-import-execution-sfn.ts`  
Package ASL: `IMPORT_EXECUTION_ASL` in `@forge/imports`.

## Activation

S5 operational path is **API → SQS → ECS worker**.  
Messaging stack wiring for the state machine is prepared with `activate: false`.
Do not represent the undeployed state machine as operational.
