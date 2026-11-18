# Legal Acknowledgments — Rollback

1. Disable feature flags (tenant override or definition default):
   - `industrial.legalAcknowledgments.loginGate.enabled` = false (stops gating)
   - Optionally `industrial.legalAcknowledgments.enabled` = false
2. Do **not** delete `legal_*` tables, versions, acknowledgments, or attestations.
3. Frontend redirect and API guard no-op when flags are off.
4. Evidence remains available for audit/export after disable.
