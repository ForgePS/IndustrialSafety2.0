# FX CSS Custom Properties

**Rule:** Components use these variables (or design-system wrappers). Never hard-code hex/px in component styles.

## Naming

```text
--fx-color-surface-default
--fx-color-text-primary
--fx-color-action-primary
--fx-space-16
--fx-radius-medium
--fx-shadow-modal
--fx-elevation-3
--fx-motion-normal-duration
--fx-typography-body-medium-size
```

Prefix: `--fx-`  
Theme attribute: `data-fx-theme="light|dark"` on the application shell root.

## Example mapping

```css
:root,
[data-fx-theme="light"] {
  --fx-color-surface-default: #ffffff;
  --fx-color-text-primary: #12171c;
  --fx-color-action-primary: #184a6e;
  --fx-space-16: 16px;
  --fx-radius-medium: 8px;
}

[data-fx-theme="dark"] {
  --fx-color-surface-default: #0a0d10;
  --fx-color-text-primary: #f4f6f8;
  --fx-color-action-primary: #5e92bc;
}
```

Canonical values are authored in the JSON token files; CSS is a generated or maintained projection of those files.
