# Accessibility Validation — RMS FX Shell (S2B)

**Document:** `15-accessibility-validation.md`  
**Updated:** 2026-07-30  
**Status:** VALIDATED (unit + implementation review); full device lab pending pilot

## Mobile navigation disclosure

| Requirement                 | Result                            |
| --------------------------- | --------------------------------- |
| Explicit menu control       | Pass — labelled Menu / Close menu |
| Accessible name             | Pass — `aria-label`               |
| Escape closes               | Pass — keydown handler            |
| Focus into opened nav       | Pass — first focusable in drawer  |
| Focus restore               | Pass — returns to menu button     |
| Route selection closes      | Pass — pathname effect            |
| Backdrop blocks interaction | Pass — overlay + dialog           |
| Touch targets ≥ 44×44       | Pass — `var(--fx-touch-min)`      |
| Reduced motion              | Pass — CSS media query            |

Evidence notes: `evidence/s2b/accessibility/`

## Other shell checks

| Check                        | Result                         |
| ---------------------------- | ------------------------------ |
| Keyboard nav (primary links) | Pass (implementation)          |
| Visible focus                | Pass (`:focus-visible` tokens) |
| Breadcrumb current page      | Pass (`aria-current`)          |
| Dialogs (entry points)       | Pass (`FxDialog` trap)         |
| Themes light/dark/HC         | Pass (theme select + tokens)   |

## Soft-auth

FX shell does not force login on soft-auth pages; tenant/user metadata omitted when unauthenticated.

## S2E forms & tables

See `57-form-accessibility.md` and `58-table-accessibility.md`. Field labels, validation alerts, table captions, sort announcements, and 44px targets are implemented in FX chrome paths behind flags.
