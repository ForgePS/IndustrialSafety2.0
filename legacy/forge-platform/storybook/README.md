# FX Storybook (placeholder)

FX-S1 uses the **reference app playground** (`apps/forge-experience-reference` → `/playground`) as the primary interactive component gallery.

Full Storybook can be wired here in a follow-up without touching production apps:

```bash
# future
pnpm --filter @forge/forge-experience-reference storybook
```

Until then, validate component states in the reference playground across themes and viewports.
