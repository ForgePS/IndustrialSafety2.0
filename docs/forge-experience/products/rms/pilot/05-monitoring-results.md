# 05 — Monitoring Results

**Phase:** FX-P1  
**Status:** Runbook ready — live dashboards not yet bound to a pilot window

## Existing signals (no new FX monitoring product)

| Signal                  | Source                                                                        | Use in pilot                        |
| ----------------------- | ----------------------------------------------------------------------------- | ----------------------------------- |
| Feature override writes | Audit `feature.put` / `FEATURE_CHANGED`                                       | Confirm only pilot tenant changed   |
| API errors / latency    | Existing platform API / ALB / CloudWatch                                      | Compare pilot vs baseline           |
| Auth failures           | Cognito / platform auth logs                                                  | Watch after flag flips              |
| Client FX diagnostics   | `[rms-fx-module]` console (non-prod or `NEXT_PUBLIC_FX_RMS_DIAGNOSTICS=true`) | Dev/staging only — avoid tokens/PII |
| Client boundaries       | `[rms-fx-forms                                                                | tables                              | dashboard | workspace]` warns | Watch for render failures |

## Recommended alerts (ops — configure if not present)

| Alert                          | Condition                            | Action                        |
| ------------------------------ | ------------------------------------ | ----------------------------- |
| API 5xx spike                  | Sustained elevation after Wave N     | Pause enablement; investigate |
| Auth failure spike             | Elevated Cognito / session errors    | Suspend pilot                 |
| Feature override outside pilot | Unexpected tenant ID in audit        | Investigate / revert          |
| Client error rate              | RUM / browser error sink if deployed | Correlate to FX routes        |

## Gap (honest)

No dedicated CloudWatch dashboard solely for FX flag resolution was found in-repo. Pilot relies on existing API/auth monitoring + audit of feature overrides + manual UX validation.

## Pilot window results

| Period      | Errors | Latency | Notes |
| ----------- | ------ | ------- | ----- |
| Not started | —      | —       | —     |
