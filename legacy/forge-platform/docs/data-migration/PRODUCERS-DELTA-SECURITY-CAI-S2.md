# PRODUCERS — Delta security regression (CAI-S2)

Re-ran CAI-S1R security gates after delta apply.

| Gate                        | Result                          |
| --------------------------- | ------------------------------- |
| PUBLIC_DOCUMENT_ACCESS      | DENIED                          |
| PERMANENT_SIGNED_URLS       | 0                               |
| CROSS_TENANT_LIST           | DENIED                          |
| CROSS_TENANT_DETAIL         | DENIED                          |
| CROSS_TENANT_DOCUMENT       | DENIED                          |
| CROSS_TENANT_QR             | DENIED                          |
| CROSS_TENANT_WC             | DENIED                          |
| CROSS_TENANT_WRITE          | DENIED                          |
| WC_MEDICAL_STANDARD_ROLE    | DENIED                          |
| WC_MEDICAL_ELEVATED_ROLE    | ALLOWED                         |
| WC_DOCUMENT_STANDARD_ROLE   | DENIED                          |
| WC_DOCUMENT_ELEVATED_ROLE   | ALLOWED                         |
| WC_GUC_LEAKAGE              | 0                               |
| WC_CONNECTION_POOL_SECURITY | PASS                            |
| PLATFORM_ADMIN_CONTEXT      | PASS (`PLATFORM_ADMIN_SUPPORT`) |
| WORKERS_COMP_SECURITY       | PASS                            |
| CROSS_TENANT_SECURITY       | PASS                            |
| NEW_CRITICAL_ERRORS         | 0                               |
| NEW_SECURITY_ERRORS         | 0                               |

Schema tip check may report FAIL when migrations beyond `0040` exist; industrial domain tables and RLS policies remain present and enforced.
