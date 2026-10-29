# 05 — Support Plan (GA)

**Status:** **DRAFT**

## Model

| Tier | Responsibility                                                                              |
| ---- | ------------------------------------------------------------------------------------------- |
| L1   | Tenant admin / help desk — confirm flag state, collect repro                                |
| L2   | Platform ops — feature overrides, rollback, monitoring                                      |
| L3   | Product engineering — presentation defects only (no new features in hypercare unless P0/P1) |

## Playbooks

1. **User sees wrong UI** — check tenant effective flags; compare to expected wave.
2. **Workflow blocked** — treat as P1; disable module override for tenant; restore legacy.
3. **Suspected tenant leak** — P0; disable all FX overrides for tenant; escalate security.
4. **Rollback request** — delete module override; verify legacy &lt; 5 minutes.

## Contacts

| Role         | Name            | Channel |
| ------------ | --------------- | ------- |
| GA owner     | TBD at approval |         |
| On-call      | TBD             |         |
| Exec sponsor | TBD             |         |

Fill at GA authorization — not during blocked prep.
