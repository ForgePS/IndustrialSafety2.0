# DM-S1 Identity Mapping

**Source:** Firebase Auth + Firestore personnel / memberships  
**Sprint:** DM-S1 (metadata extract only — no Cognito create)

## Headline

| Population          | Count (DM-S0 baseline) | Meaning                                       |
| ------------------- | ---------------------- | --------------------------------------------- |
| Firebase Auth users | 10                     | Interactive app operators (password provider) |
| `personnelRecords`  | ~1097                  | Worker / employee domain records              |

**Personnel ≠ Auth users.** Do not create Cognito identities for all personnel.

## Relationship classes

| Class              | Definition                                               | Migration implication                         |
| ------------------ | -------------------------------------------------------- | --------------------------------------------- |
| PERSONNEL_AND_AUTH | Personnel record linked to Firebase UID (email/UID join) | Candidate Cognito user + industrial_personnel |
| AUTH_ONLY          | Auth user without personnel row                          | Platform/admin or membership-only identity    |
| PERSONNEL_ONLY     | Personnel without Auth user                              | Domain record only — **no Cognito**           |
| UNKNOWN            | Insufficient join evidence                               | Quarantine identity linking                   |

## Auth metadata extracted (safe)

Included: `firebaseUid`, `email`, `emailVerified`, `disabled`, `providerIds`, `createdAt`, `lastSignInAt`, business claims summary.

**Excluded:** password hashes, salts, tokens, refresh tokens, private credential material.

Firebase UID is preserved permanently as `legacy source identity` for later Cognito link tables.

## Join strategy (later sprints — not executed in DM-S1)

1. Prefer explicit UID fields on membership / organization_users / platformUsers.
2. Else email match (case-normalized) between Auth and personnel.
3. Else PERSONNEL_ONLY.

## Cognito policy

| Action                                   | DM-S1                | Future authorized sprint           |
| ---------------------------------------- | -------------------- | ---------------------------------- |
| Extract Auth metadata                    | YES                  | —                                  |
| Create Cognito users for Auth population | NO                   | When authorized                    |
| Create Cognito users for all personnel   | **NEVER by default** | Explicit product decision required |
| Seed Aurora industrial_personnel         | NO                   | Transform/import sprint            |

## Output

Logical package: `auth/auth-metadata.ndjson` (gitignored under `.tmp-data-migration/`).
