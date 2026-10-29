# Risk Register — FX-S2 RMS

**Document:** `22-risk-register.md`  
**Updated:** 2026-07-30

| ID       | Risk                                                        | Severity | Likelihood | Mitigation                                                         | Status          |
| -------- | ----------------------------------------------------------- | -------- | ---------- | ------------------------------------------------------------------ | --------------- |
| R-S2-001 | Incident/NERIS logic accidentally changed during UI migrate | P0       | M          | Presentation-only PRs; payload tests; gate S2F late                | Open            |
| R-S2-002 | Auth/tenant behavior drift                                  | P0       | L          | No auth changes; adapter only                                      | Open            |
| R-S2-003 | Soft-auth routes miss permission UX                         | P1       | M          | Preserve FeatureGate + API errors; add permission visibility tests | Open            |
| R-S2-004 | Catalog modules mistaken for live UI                        | P2       | H          | Baseline docs mark gaps; stop inventing routes                     | Mitigated (S2A) |
| R-S2-005 | Dual nav sources (hardcoded vs Config Studio)               | P2       | M          | DEC-S2-005 Controlled Hybrid accepted; registry authoritative      | Mitigated       |
| R-S2-006 | Fleet V2 vs apparatus overlap (future)                      | P1       | M          | Provenance doc before unified UI                                   | Deferred        |
| R-S2-007 | FX mobile nav disclosure incomplete                         | P2       | M          | Mobile drawer implemented in RmsFxShell                            | Mitigated       |
| R-S2-008 | color-mix Safari fallbacks                                  | P3       | M          | Complete before broad GA                                           | Open            |
| R-S2-009 | Scope creep / tech-debt piggyback                           | P2       | H          | Charter restrictions; PR checklist                                 | Open            |
| R-S2-010 | Platform stabilization gates block work                     | P1       | L          | Stop condition; escalate                                           | Watch           |
| R-S2-011 | Platform admin wildcard enabling FX                         | P1       | M          | FX resolver ignores admin auto-true                                | Mitigated       |
| R-S2-012 | Seed flag definitions without ops awareness                 | P3       | L          | Default false; documented in flag plan                             | Open            |
| R-S2-013 | Review queue client-side status filter                      | P3       | L          | Matches legacy review page behavior                                | Accepted        |
| R-S2-014 | Notifications widget non-operational by design              | Info     | H          | Honest empty; no fabricated counts                                 | Accepted        |
| R-S2-015 | Sidebar timeline uses record timestamps only                | P3       | L          | Full history remains on Review section                             | Accepted        |
| R-S2-016 | Incident hides Notes/Attachments/Audit sidebar duplicates   | Info     | H          | Domain panels remain authoritative                                 | Accepted        |
| R-S2-017 | FieldRenderer still on legacy chrome                        | P3       | M          | Deferred; payloads unchanged                                       | Open            |
| R-S2-018 | Incidents list sort UI not applied to API                   | P3       | H          | Legacy parity                                                      | Accepted        |
