# Firebase Inventory (DM-S0)

Read-only inventory CLI for **`forge-industrial-safety` only**.

## Safety

- Refuses any other GCP/Firebase project (`PROJECT_GUARD`)
- No Firestore/Auth/Storage write APIs
- Evidence written under gitignored `.tmp-data-migration/`

## Usage

```bash
pnpm migration:firebase:inventory
# equivalent:
pnpm --filter @forge/firebase-inventory inventory -- --project forge-industrial-safety --out ../../../.tmp-data-migration/dm-s0
```

Requires Application Default Credentials with access to the project.
