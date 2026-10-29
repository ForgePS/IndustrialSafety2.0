# 06 — Performance Results

**Phase:** FX-P1  
**Status:** **NOT MEASURED** — capture during live pilot waves

## Method

For each wave (flags off baseline → flags on):

| Metric                | Tool                       | Capture                       |
| --------------------- | -------------------------- | ----------------------------- |
| Page load / LCP / INP | Lighthouse / Web Vitals    | Desktop + tablet              |
| Navigation transition | Manual stopwatch / RUM     | Key routes                    |
| Table render          | Performance panel          | Lists with typical row counts |
| Form render / save    | Network + timing           | Create/save paths             |
| API latency           | Server metrics             | p50/p95 for touched endpoints |
| JS errors             | Browser console / RUM      | Count by route                |
| Memory                | Performance monitor (spot) | Optional                      |

## Results table (fill during pilot)

| Route             | Mode        | LCP | INP | API p95 | JS errors | Notes |
| ----------------- | ----------- | --- | --- | ------- | --------- | ----- |
| `/incidents/`     | Legacy      |     |     |         |           |       |
| `/incidents/`     | FX          |     |     |         |           |       |
| `/review/`        | Legacy      |     |     |         |           |       |
| `/review/`        | FX          |     |     |         |           |       |
| `/cad/messages/`  | Legacy / FX |     |     |         |           |       |
| `/configuration/` | Legacy / FX |     |     |         |           |       |

## Acceptance

No unsupported claims. Mark wave acceptable when FX does not introduce user-blocking latency vs legacy for the same workflows.
