# Industrial visual source of truth (design decision)

**Status:** ACCEPTED  
**Date:** 2026-08-11  
**Product:** Forge Industrial Safety (AWS `industrial-web`)  
**Authority:** Design decision override (this document)

## Decision

**Sneat Free 1.0.0 (ThemeSelection, MIT) is the visual / design source of truth** for the AWS Forge Industrial application.

End state:

```text
FORGE INDUSTRIAL SAFETY
+ SNEAT VISUAL DESIGN SYSTEM
+ FORGE BRANDING (identity / copy / logo)
+ AWS SAAS ARCHITECTURE
```

## Rejected

The previously proposed Firebase-green brand-alignment direction is **REJECTED**.

Do **not**:

- retheme Sneat primary to Firebase green (`#8bc53f`)
- replace `#696cff` with `#8bc53f`
- replace Public Sans with Inter
- port the Firebase Tailwind shell
- attempt visual parity with the Firebase production application
- treat Firebase theme differences as defects

## Canonical Sneat theme (defaults)

| Token                | Value                |
| -------------------- | -------------------- |
| Primary              | `#696cff`            |
| Primary hover / dark | `#5f61e6`            |
| Secondary            | `#8592a3`            |
| Success              | `#71dd37`            |
| Info                 | `#03c3ec`            |
| Warning              | `#ffab00`            |
| Danger               | `#ff3e1d`            |
| Body background      | `#f5f5f9`            |
| Body text            | `#697a8d`            |
| Dark / navy          | `#435971`, `#233446` |
| Typography           | Public Sans          |

These remain the default Forge Industrial application theme unless explicitly overridden by **tenant branding** (approved tokens only). Tenant overrides must not break accessibility or component semantics.

## What may change (template → Forge)

Replace demo / template identity only:

- Sneat demo logo → Forge Industrial / Forge logo (or approved tenant logo URL)
- Sneat demo product name → Forge Industrial Safety
- Demo navigation → Forge modules
- Demo user / company content → Forge tenant data
- Demo cards / data → actual Forge data
- Placeholder controls → real Forge functionality **or hide until ready**

## What must not change (preserve Sneat)

Color palette, typography, card / spacing / menu / navbar / backgrounds, form / table / badge / button / alert / modal / dropdown styling, shadows, radius, density, responsive layout behavior.

Do **not** restyle these to resemble Firebase.

## Parity interpretation

| Finding                    | Interpretation                                         |
| -------------------------- | ------------------------------------------------------ |
| DS-01 Design system        | ACCEPTED BY DESIGN                                     |
| BR-01 / BR-02 Brand colors | ACCEPTED BY DESIGN                                     |
| TY-01 Typography           | ACCEPTED BY DESIGN                                     |
| SH-01 Shell structure      | ACCEPTED BY DESIGN                                     |
| SH-02 Breakpoints          | ACCEPTED if responsive validation passes               |
| IC-01 Icons (Boxicons)     | ACCEPTED BY DESIGN                                     |
| LG-01 Demo mark            | Remediable — replace with Forge branding               |
| DK-01 Dark mode            | Remediable — full theme **or** hide toggle             |
| NV-01 Navbar stubs         | Remediable — complete **or** hide                      |
| ST-01 Settings             | Remediable — connect **or** remove misleading controls |

**DATA PARITY ≠ VISUAL PARITY.** Firebase remains the functional / data migration source where applicable. Sneat is the visual source of truth.

## References

- [sneat-theme-provenance.md](./sneat-theme-provenance.md)
- [SHELL.md](../forge-saas-foundation/SHELL.md)
- App: `apps/industrial-web` (vendored `/public/sneat`)
