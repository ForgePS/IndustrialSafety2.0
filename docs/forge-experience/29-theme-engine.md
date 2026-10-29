# FX Theme Engine

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 4)  
**Author:** Forge Experience Program  
**Last Updated:** 2026-07-30

## Purpose

Provide theme variation without forking components.

## Scope

Light, dark, high contrast, agency/tenant branding overlays, and optional future seasonal themes.

## Goals

- Themes override **tokens only**
- Never override component logic
- One component implementation across themes

## Supported themes

| Theme                  | Use                                              |
| ---------------------- | ------------------------------------------------ |
| Light Theme            | Default administrative / daylight                |
| Dark Theme             | Low-light ops / night                            |
| High Contrast Theme    | Accessibility / bright outdoor glare scenarios   |
| Agency Branding        | Approved accent/logo token overlays              |
| Tenant Branding        | Approved tenant accent overlays within FX limits |
| Future Seasonal Themes | Optional; token overlays only                    |

## Rules

1. Themes map primitives → semantic tokens (`data-fx-theme`, branding attributes).
2. Components read semantic/component tokens only.
3. Branding may not reduce contrast below AA.
4. Products may not ship private theme engines.

## Responsibilities

| Owner         | Responsibility                              |
| ------------- | ------------------------------------------- |
| FX            | Theme token sets and switching contract     |
| Tenant/Agency | Brand assets within approved slots          |
| Platform      | Persistence of user/tenant theme preference |

## Examples

- Shell sets `data-fx-theme="dark"`
- Tenant accent overrides `color.action.primary` via approved extension token

## Best practices

- Test all themes for status/priority legibility
- Prefer semantic aliases over one-off brand hex in components

## Anti-patterns

- `if (theme === 'dark')` branches inside components
- CSS overrides of component structure per tenant
- Low-contrast “brand red” that fails AA

## Future enhancements

- Seasonal theme packs
- Per-display ops theme presets

## Dependencies

- `tokens/semantic.*.json` · Brand guidelines · Accessibility

## Implementation notes

JSON token files are source; CSS variables are projection. No production theme migration in FX-S0.

## Acceptance criteria

- [x] Theme list defined
- [x] Tokens-only override rule stated
- [x] Branding constrained by AA

## Revision history

| Date       | Change                  |
| ---------- | ----------------------- |
| 2026-07-30 | Part 4 approved content |

## Related

- [05-design-tokens.md](./05-design-tokens.md)
- [22-brand-guidelines.md](./22-brand-guidelines.md)
- [21-accessibility.md](./21-accessibility.md)
