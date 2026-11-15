# Import Rollback Preparation (S5)

S5 persists rollback journal entries (`import_execution_journal`) and classifications:

- FULLY_REVERSIBLE
- COMPENSATING_ACTION
- MANUAL_REVIEW_REQUIRED
- NOT_REVERSIBLE

`POST .../rollback-request` transitions to `ROLLBACK_PENDING` or `ROLLBACK_REFUSED`.

**Compensation execution is not implemented in S5.** Do not claim full rollback support.
