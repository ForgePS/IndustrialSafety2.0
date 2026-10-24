# 10 — Rollback Validation

**Phase:** FX-P1  
**Target:** &lt; 5 minutes to legacy for affected module  
**Status:** Procedure certified by design; **live validation pending**

## Procedure (per module)

1. Identify override key(s) for the wave.
2. `DELETE /api/v1/tenants/{pilotTenantId}/features/{featureKey}` (or Creator Console clear).
3. Hard-refresh browser (or new session).
4. Confirm legacy presentation (`data-testid` `rms-legacy-*` where present).
5. Confirm other enabled modules unchanged.
6. Confirm APIs/session/tenant still work.
7. Record elapsed time.

## Results

| Module flag | Elapsed | Legacy restored? | Session intact? | Other modules OK? | Tester | Date |
| ----------- | ------- | ---------------- | --------------- | ----------------- | ------ | ---- |
| —           | —       | Pending          | Pending         | Pending           | —      | —    |

## Emergency full rollback

Delete **all** `fx.rms.*` overrides for the pilot tenant. Entire tenant returns to legacy. Global defaults remain false for all other tenants.
