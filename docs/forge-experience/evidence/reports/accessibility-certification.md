# Accessibility Certification — FX-S1.5

**Document:** `docs/forge-experience/reference/accessibility-certification.md`  
**Standard:** WCAG 2.2 AA  
**Subject:** `@forge/fx-*` packages + `apps/forge-experience-reference`  
**Date:** 2026-07-30  
**Status:** COMPLETE (findings logged; no production systems modified)

## Method

- Keyboard walkthrough of shell, dashboard, forms, workspace, patterns, playground
- Accessibility tree inspection (landmarks, headings, dialogs, form labels)
- Token/CSS review for focus rings, reduced motion, touch targets
- Contrast review against light / dark / high-contrast themes
- Zoom review at 200% and 400% (layout reflow via fluid grid + SVG `viewBox`)

## Checklist results

| Check                       | Result             | Notes                                                                       |
| --------------------------- | ------------------ | --------------------------------------------------------------------------- |
| Keyboard-only navigation    | Pass               | Primary nav, theme, buttons, forms reachable                                |
| Screen reader compatibility | Pass with findings | Landmarks (`nav`, `main`), table captions, chart `aria-label` + data tables |
| Focus visibility            | Pass               | `:focus-visible` on buttons and fields                                      |
| Tab order                   | Pass               | Document order matches visual order on reference routes                     |
| Modal trapping              | Pass               | `FxDialog` focus trap + Escape + restore focus (S1.5 fix)                   |
| Dialog announcements        | Pass               | `role="dialog"` + `aria-modal` + `aria-labelledby`                          |
| Form error announcements    | Pass               | `aria-invalid`, `aria-describedby`, `role="alert"` on errors                |
| Contrast ratios             | Pass with findings | Semantic tokens; HC theme available — see theme cert                        |
| Zoom 200%                   | Pass               | Content reflows; no horizontal clip on dashboard cards                      |
| Zoom 400%                   | Pass with findings | Nav stacks; map controls stack below canvas                                 |
| Reduced motion              | Pass               | `prefers-reduced-motion` disables button/skeleton transitions               |

## Issues

| ID       | Severity | Component     | Description                                                                 | Recommended fix                                                                | Status    |
| -------- | -------- | ------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------- |
| A11Y-001 | Medium   | `FxDialog`    | Shared fixed title id risk if two dialogs mount                             | Generate unique title ids per instance                                         | Open      |
| A11Y-002 | Low      | `FxMapPanel`  | Layer checkboxes exposed as `readonly` in some AT trees while controlled    | Prefer uncontrolled or ensure label/`htmlFor` pairing remains stable under SSR | Open      |
| A11Y-003 | Medium   | `FxAppShell`  | Narrow viewports stack full nav above content (no disclosure)               | Add collapsible primary nav for phone widths                                   | Open      |
| A11Y-004 | Low      | Reference app | Next.js hydration warning observed when theme select mutated during session | Mitigated with `suppressHydrationWarning` + SSR-safe `useResponsive`           | Mitigated |
| A11Y-005 | Low      | Charts        | Pie/donut rely on color + legend text (not pattern fills)                   | Add patterned fills or hatch for non-color differentiation                     | Open      |
| A11Y-006 | Info     | Drawing tools | Intentionally disabled (reference only)                                     | Keep disabled until GIS backend authorized                                     | Accepted  |

No Critical blockers remain for RC1 reference certification. Open medium items tracked for FX-S1.5 follow-up / FX-S2 prep — they do not block RC1 packaging of the reference design system.

## Sign-off

| Role                     | Result                       |
| ------------------------ | ---------------------------- |
| Agent certification pass | Complete 2026-07-30          |
| Human product owner      | Pending formal approval gate |
