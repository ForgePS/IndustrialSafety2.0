# PRODUCERS — Delta reconciliation (CAI-S2)

## Source accounting

| Metric                                                  |                     Value |
| ------------------------------------------------------- | ------------------------: |
| SOURCE_DELTA_DOCS (root NEW+MODIFIED+DELETED)           |               30 (24+6+0) |
| Producers candidates                                    |                        28 |
| Non-Producers / non-import expected skips among changes | included in EXPECTED_SKIP |
| Ambiguous                                               |                     **0** |

## Target net effect vs pre-delta baseline

| Entity                         | Δ producers rows | Explanation                            |
| ------------------------------ | ---------------: | -------------------------------------- |
| industrial_history_records     |              +18 | New activity/auth/QR audit history     |
| industrial_qr_link_scan_events |               +5 | Append-only unsafe collection strategy |
| industrial_migration_id_map    |              +25 | Source→target maps for new rows        |
| industrial_loto_procedures     |          0 count | 1 source UPDATE absorbed into upsert   |
| qr_links                       |          0 count | 1 source UPDATE absorbed into upsert   |

## Skips / warnings

| Class                      | Count | Status                               |
| -------------------------- | ----: | ------------------------------------ |
| SKIP_MISSING_PARENT        |  2576 | Accounted (SOURCE_ORPHAN; unchanged) |
| SKIP_NON_PRODUCERS         |  1419 | Accounted (+1 vs S1R)                |
| WARNING_UNEXPLAINED        |     0 | PASS                                 |
| DELTA_UNRESOLVED_CONFLICTS |     0 | PASS                                 |

## Conflicts

No unexpected AWS target business drift requiring manual merge. Attachment promoted keys preserved (not overwritten with Firebase-relative paths).

## Verdict

**DELTA_RECONCILIATION: PASS**
