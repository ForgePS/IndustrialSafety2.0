# 12 — Risk Register (S2F)

| ID        | Risk                                                                               | Sev  | Mitigation                                        | Status    |
| --------- | ---------------------------------------------------------------------------------- | ---- | ------------------------------------------------- | --------- |
| R-S2F-001 | Foundation-only flags previously enabled FX on incident routes without module gate | P2   | S2F-1 requires module+foundation                  | Mitigated |
| R-S2F-002 | FieldRenderer remains legacy chrome                                                | P3   | Compatibility wrap; deferred replacement          | Accepted  |
| R-S2F-003 | Mixed-mode confusion                                                               | P2   | Central resolver + unit tests + docs              | Open      |
| R-S2F-004 | CAD/Review accidental start before checkpoint                                      | P1   | Immediate work limited to S2F-1                   | Mitigated |
| R-S2F-005 | Specialty review panel remains legacy under S2F-2                                  | P3   | Compat; officer panel FX only                     | Accepted  |
| R-S2F-006 | Auth text mentioned `/review/{id}` but route absent                                | Info | Documented live URLs only                         | Accepted  |
| R-S2F-007 | “Activity” in S2F-3 title but no activity feed in rms-web                          | P3   | Migrated messages list only; gap documented       | Accepted  |
| R-S2F-008 | `/cad/operations/` adjacent but not under cadMessages                              | Info | Deferred; separate authorization                  | Open      |
| R-S2F-009 | S2E foundation-only FX on connections replaced by module∧foundation                | P2   | Intentional strangler; module off forces legacy   | Mitigated |
| R-S2F-010 | No archive/delete/edit in live connections UI                                      | Info | Documented N/A; not invented                      | Accepted  |
| R-S2F-011 | No conflict detail/filter UI in live rms-web                                       | P3   | Migrated OPEN list + resolve only; gap documented | Accepted  |
| R-S2F-012 | Resolve actions are irreversible operator mutations                                | Info | Same APIs/payloads; presentation only             | Accepted  |
| R-S2F-013 | Planning implies broader NERIS settings than live `/configuration/`                | P3   | Migrated verified operating mode + overlays only  | Accepted  |
| R-S2F-014 | Operating mode save always posts `MANUAL_ONLY`                                     | Info | Preserved legacy behavior                         | Accepted  |
| R-S2F-015 | Login left legacy under S2F-7                                                      | Info | Auth explicitly out of scope                      | Accepted  |
| R-S2F-016 | Planning “admin” broader than live RMS screens                                     | P3   | Migrated select-tenant + health only              | Accepted  |
| R-S2F-017 | Utilities health FX with no foundation dependency                                  | Info | Documented; module-only surface                   | Accepted  |
