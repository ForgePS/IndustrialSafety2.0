# Duplicate Detection Architecture (S4)

Shared, product-neutral duplicate engine in `@forge/imports`.

## Algorithms

- **exact** — normalized string equality
- **weighted** — field weights summed into confidence
- **fuzzy** — deterministic Levenshtein with max distance
- **composite** — required key parts must all match for confidence boost

## Confidence bands

Configurable thresholds (defaults: HIGH ≥ 0.9, MEDIUM ≥ 0.65, else LOW).

Recommended actions are profile-configurable (`UPDATE` / `MERGE_REVIEW` / `CREATE`).

## Merge candidates

Generated as structured JSON (`merge_candidate_json`) with field comparisons and
conflict lists. **No automatic merge** and **no production writes**.

## Tenant isolation

Candidates persist in `import_duplicate_candidates` with FORCE RLS on `tenant_id`.
Sensitive field values are masked in API responses.
