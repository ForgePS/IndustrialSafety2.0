# ADR-018: Sensitive data encryption

**Status:** Accepted  
**Date:** 2026-07-25  
**Sprint:** 1D

## Context

SSN, bank details, and similar attributes need stronger control than ordinary column storage. Mixing them into wide person tables increases exposure in dumps, logs, and broad `SELECT *` paths.

## Decision

**Separate table + KMS envelope encryption; never log plaintext.**

1. Store sensitive attributes in `person_sensitive_data` (or equivalent), keyed to Person, not inline on the main person row.
2. Encrypt values with envelope encryption using a dedicated KMS **sensitive-data** key (DEK wrapped by KMS).
3. Decrypt only in authorized application paths; never write plaintext sensitive values to logs, traces, or metrics.
4. Access requires both authorization and intentional decrypt; list/search APIs default to non-sensitive fields.

## Consequences

- Reduced blast radius for backups and accidental query exposure.
- Extra read latency and KMS dependency for sensitive fields; key policy and IAM must be tight.
- Schema and ORM must avoid joining sensitive columns into general person DTOs.
