# 04 — Monitoring Plan (GA)

**Status:** **DRAFT**

## Signals

| Signal                 | Source                            | GA use                           |
| ---------------------- | --------------------------------- | -------------------------------- |
| API latency / 5xx      | Platform API / ALB / CloudWatch   | Alert on regression after enable |
| Auth failures          | Cognito / auth logs               | Spike → investigate / pause      |
| Feature override audit | `feature.put` / `FEATURE_CHANGED` | Detect unexpected tenants        |
| Client errors          | RUM / browser sink (if deployed)  | Correlate to FX routes           |
| Permission denials     | API 403 rates                     | Compare to baseline              |

## Dashboards / alerts

Configure or reuse existing ops dashboards before GA entry. FX-P2 does not authorize building new product features; ops may wire alerts using existing telemetry.

## Pilot → GA handoff

Copy measured baselines from `../pilot/05-monitoring-results.md` and `../pilot/06-performance-results.md` into GA hypercare runbooks when pilot closes successfully.
