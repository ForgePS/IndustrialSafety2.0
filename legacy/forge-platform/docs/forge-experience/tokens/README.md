# FX Tokens

Source artifacts for the Forge Experience token system.

**Rule:** Components never hard-code visual values. Everything inherits from tokens.

## Files

| File                                         | Contents                                        |
| -------------------------------------------- | ----------------------------------------------- |
| [primitives.json](./primitives.json)         | Neutral/brand/status primitives + font families |
| [semantic.light.json](./semantic.light.json) | Light theme semantic color map                  |
| [semantic.dark.json](./semantic.dark.json)   | Dark theme semantic color map                   |
| [typography.json](./typography.json)         | Display → monospace type roles                  |
| [spacing.json](./spacing.json)               | 4–96 spacing scale                              |
| [radius.json](./radius.json)                 | Small → Round                                   |
| [shadow.json](./shadow.json)                 | Small → Modal (+ elevation mapping)             |
| [motion.json](./motion.json)                 | Fast / Normal / Slow / Disabled                 |
| [breakpoints.json](./breakpoints.json)       | Phone → Operations Display                      |
| [css-variables.md](./css-variables.md)       | `--fx-*` naming and theme attribute             |

## Docs

- [05-design-tokens.md](../05-design-tokens.md) — token catalog and enforcement
- [22-brand-guidelines.md](../22-brand-guidelines.md) — brand constraints on token use
