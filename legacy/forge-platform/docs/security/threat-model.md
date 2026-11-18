# Threat Model — AI Narrative Assistant

**Status:** Foundation (stub provider; flags off)  
**Related:** [../ai/security.md](../ai/security.md), [sensitive-data.md](./sensitive-data.md)

## Assets

| Asset                     | Notes                                            |
| ------------------------- | ------------------------------------------------ |
| Source field values       | Incident/investigation/evaluation facts          |
| Generated drafts          | May paraphrase sensitive operational detail      |
| Provider credentials      | Secret ARNs only; not in foundation runtime path |
| Audit / usage records     | Evidence of who requested/accepted what          |
| Tenant isolation boundary | Cross-tenant leakage is critical severity        |

## Trust boundaries

1. Browser / product UI → `platform-api` (authn/authz)
2. Application → database (RLS, tenant scope)
3. Application → AI provider (none in production foundation; stub local only)
4. Application → logs/metrics (must stay free of restricted payloads)

## Key threats and mitigations

| ID  | Threat                                      | Mitigation                                                                             |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------- |
| T1  | Prompt injection exfiltrates other records  | Tenant-scoped source manifest only; no tool calling; fail closed on flags/permissions  |
| T2  | Restricted PII/PHI sent to model            | Classification gate + redaction; RESTRICTED blocked by default                         |
| T3  | Hallucinated facts accepted silently        | Human accept required; draft labels; evaluation heuristics; anti-hallucination prompts |
| T4  | Auto-submit to NERIS/ePCR                   | Explicitly out of scope; no such code paths in foundation                              |
| T5  | Product modules embed provider SDKs         | Provider abstraction; SDK import ban in product packages                               |
| T6  | Flags enabled on Phase 4 synthetic tenant   | Defaults false; Phase 4 acceptance must not enable                                     |
| T7  | Over-collection / training on customer data | Analytics flag off; purpose limitation in privacy docs                                 |
| T8  | Cost / DoS via generation spam              | Quotas, cost ceiling, rate-oriented policy defaults                                    |
| T9  | Secrets in logs or tickets                  | Observability helpers; IR guidance forbids pasting bodies                              |
| T10 | Privilege escalation via policy PATCH       | Policy mutation API reserved / fail-closed                                             |

## Out of scope (this revision)

- Production LLM provider compromise analysis (no live provider)
- Model supply-chain attestation for third-party models
- Phase 5 product UX threat modeling

## Residual risk

Stub-only foundation residual risk is low while flags remain off. Enabling any production provider without completing Phase 5 authorization would materially increase residual risk (data egress, cost, hallucination impact).
