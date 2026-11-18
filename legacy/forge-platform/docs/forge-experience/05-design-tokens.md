# FX Design Tokens

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 2)  
**Rule:** Never hard-code visual values into components. Everything inherits from tokens.

## Purpose

Design tokens are the single source of visual truth for every Forge product. Components, patterns, and product extensions consume tokens only.

## Token layers

| Layer     | Role                                       | Example                                             |
| --------- | ------------------------------------------ | --------------------------------------------------- |
| Primitive | Raw scales                                 | `primitive.color.neutral.800`, `primitive.space.16` |
| Semantic  | Meaning across products                    | `color.text.primary`, `color.action.danger`         |
| Component | Bound to component anatomy                 | `button.primary.bg` → `color.action.primary`        |
| Theme     | Light / dark / operations-display mappings | Same semantic names, different primitives           |

Products may add **extension tokens** only when approved by FX and aliased to existing semantic roles.

## Source artifacts

| File                                                         | Contents                    |
| ------------------------------------------------------------ | --------------------------- |
| [`tokens/primitives.json`](./tokens/primitives.json)         | Primitive scales            |
| [`tokens/semantic.light.json`](./tokens/semantic.light.json) | Light theme semantic tokens |
| [`tokens/semantic.dark.json`](./tokens/semantic.dark.json)   | Dark theme semantic tokens  |
| [`tokens/typography.json`](./tokens/typography.json)         | Type roles                  |
| [`tokens/spacing.json`](./tokens/spacing.json)               | Spacing scale               |
| [`tokens/radius.json`](./tokens/radius.json)                 | Radius scale                |
| [`tokens/shadow.json`](./tokens/shadow.json)                 | Shadow + elevation          |
| [`tokens/motion.json`](./tokens/motion.json)                 | Motion                      |
| [`tokens/breakpoints.json`](./tokens/breakpoints.json)       | Responsive breakpoints      |
| [`tokens/css-variables.md`](./tokens/css-variables.md)       | CSS custom property naming  |

---

## Color tokens (semantic)

### Surface

| Token                     | Role                                                   |
| ------------------------- | ------------------------------------------------------ |
| `color.surface.default`   | Primary page / panel background                        |
| `color.surface.secondary` | Secondary panels, zebra, inset regions                 |
| `color.surface.tertiary`  | Tertiary wells, tool chrome                            |
| `color.surface.inverse`   | Inverse surfaces (dark on light theme / light on dark) |
| `color.surface.overlay`   | Scrim / modal backdrop                                 |
| `color.surface.disabled`  | Disabled control / row background                      |

### Text

| Token                  | Role                                  |
| ---------------------- | ------------------------------------- |
| `color.text.primary`   | Primary readable text                 |
| `color.text.secondary` | Supporting text                       |
| `color.text.muted`     | Hints, metadata, de-emphasized        |
| `color.text.inverse`   | Text on inverse / strong action fills |

### Border

| Token                  | Role                      |
| ---------------------- | ------------------------- |
| `color.border.default` | Standard borders          |
| `color.border.subtle`  | Hairline / quiet dividers |
| `color.border.focus`   | Focus ring                |

### Action

| Token                    | Role                   |
| ------------------------ | ---------------------- |
| `color.action.primary`   | Primary actions        |
| `color.action.secondary` | Secondary actions      |
| `color.action.success`   | Affirmative commit     |
| `color.action.warning`   | Caution actions        |
| `color.action.danger`    | Destructive actions    |
| `color.action.disabled`  | Disabled action chrome |

### Status

| Token                  | Role                    |
| ---------------------- | ----------------------- |
| `color.status.success` | Success state           |
| `color.status.warning` | Warning state           |
| `color.status.danger`  | Danger / failed state   |
| `color.status.info`    | Informational state     |
| `color.status.neutral` | Neutral / unknown state |

### Priority

| Token                     | Role              |
| ------------------------- | ----------------- |
| `color.priority.low`      | Low priority      |
| `color.priority.normal`   | Normal priority   |
| `color.priority.high`     | High priority     |
| `color.priority.critical` | Critical priority |

**Accessibility:** Text on surfaces and status/priority chips must meet WCAG 2.2 AA. Status and priority never rely on color alone (icon + label required).

---

## Typography tokens

| Token                    | Role                 |
| ------------------------ | -------------------- |
| `typography.display.xl`  | Largest display      |
| `typography.display.l`   | Display              |
| `typography.heading.xl`  | Page / record titles |
| `typography.heading.l`   | Section titles       |
| `typography.heading.m`   | Subsection titles    |
| `typography.heading.s`   | Compact headings     |
| `typography.body.large`  | Emphasized body      |
| `typography.body.medium` | Default body         |
| `typography.body.small`  | Dense body / tables  |
| `typography.caption`     | Captions / metadata  |
| `typography.label`       | Control labels       |
| `typography.monospace`   | IDs, codes, logs     |

Each type token defines: `fontFamily`, `fontSize`, `lineHeight`, `fontWeight`, `letterSpacing`.

---

## Spacing tokens

Scale (px): **4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96**

| Token      | Value |
| ---------- | ----- |
| `space.4`  | 4     |
| `space.8`  | 8     |
| `space.12` | 12    |
| `space.16` | 16    |
| `space.20` | 20    |
| `space.24` | 24    |
| `space.32` | 32    |
| `space.40` | 40    |
| `space.48` | 48    |
| `space.64` | 64    |
| `space.80` | 80    |
| `space.96` | 96    |

Use spacing tokens for padding, gap, and margin. Do not invent ad-hoc pixels.

---

## Radius tokens

| Token           | Role                             |
| --------------- | -------------------------------- |
| `radius.small`  | Inputs, chips                    |
| `radius.medium` | Cards, panels                    |
| `radius.large`  | Large containers                 |
| `radius.xl`     | Hero / shell accents (sparingly) |
| `radius.round`  | Pills, avatars (full round)      |

---

## Shadow tokens

| Token             | Role             |
| ----------------- | ---------------- |
| `shadow.small`    | Subtle lift      |
| `shadow.medium`   | Cards            |
| `shadow.large`    | Raised panels    |
| `shadow.floating` | Popovers / FABs  |
| `shadow.modal`    | Modals / dialogs |

---

## Elevation tokens

| Token         | Role                           |
| ------------- | ------------------------------ |
| `elevation.0` | Flat / flush                   |
| `elevation.1` | Slight raise                   |
| `elevation.2` | Panel                          |
| `elevation.3` | Overlay content                |
| `elevation.4` | Topmost chrome (menus, modals) |

Elevation maps to shadow + z-index bands. Components use elevation tokens, not raw z-index numbers.

---

## Motion tokens

| Token             | Role                                                         |
| ----------------- | ------------------------------------------------------------ |
| `motion.fast`     | Micro-interactions                                           |
| `motion.normal`   | Standard transitions                                         |
| `motion.slow`     | Large panel / route transitions                              |
| `motion.disabled` | No animation (`0ms`) when reduced motion or explicit disable |

Include `duration` and `easing`. Respect `prefers-reduced-motion` by switching to `motion.disabled` or instant cuts.

---

## Responsive breakpoints

| Token                          | Role                         |
| ------------------------------ | ---------------------------- |
| `breakpoint.phone`             | Phone                        |
| `breakpoint.tabletPortrait`    | Tablet portrait              |
| `breakpoint.tabletLandscape`   | Tablet landscape             |
| `breakpoint.desktop`           | Desktop                      |
| `breakpoint.largeDesktop`      | Large desktop                |
| `breakpoint.operationsDisplay` | Large command / EOC displays |

Exact pixel values live in [`tokens/breakpoints.json`](./tokens/breakpoints.json). Layouts must be designed for all six.

---

## Enforcement

1. Components reference semantic or component tokens only.
2. Hard-coded hex, px (except inside token files), or rgba in product UI is a defect.
3. Theme switching changes primitive → semantic maps; component code stays theme-agnostic.
4. Charts/maps use status/priority/data tokens — not one-off series colors unless registered as FX data-viz tokens.

## Related

- [06-design-system.md](./06-design-system.md)
- [07-component-library.md](./07-component-library.md)
- [22-brand-guidelines.md](./22-brand-guidelines.md)
