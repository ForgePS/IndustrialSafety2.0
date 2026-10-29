# Sneat theme provenance

Forge Platform adopts the **Sneat Free Bootstrap 5 Admin Template** (ThemeSelection, MIT, v1.0.0) as the shared visual language for:

- `@forge/design-system` (`--forge-*` tokens, Public Sans, layout/component primitives)
- `@forge/ui` (buttons, cards, form controls using `.forge-*` classes)
- `@forge/fx-design-tokens` (RMS `--fx-*` brand/surface bridge)
- Application shells: Industrial Safety, RMS, Forge Academy (and platform admin apps that import the design system)

## What we take / what we do not

| Included                                                      | Not included                 |
| ------------------------------------------------------------- | ---------------------------- |
| Color palette (primary `#696cff`, body `#f5f5f9`, semantics)  | Bootstrap 5 CSS/JS           |
| Typography (Public Sans)                                      | jQuery / template HTML pages |
| Radius, elevation, menu/navbar dimensions                     | Icon packs wholesale         |
| Conceptual sidebar + content shell patterns as CSS primitives | Vendor PHP/Blade/asset trees |

Apps consume CSS variables and React components only. The download under `Downloads/sneat-1.0.0` is a **reference**; Industrial also vendors Free CSS under `apps/industrial-web/public/sneat`.

## Industrial visual SoT (2026-08-11)

**Sneat is the visual source of truth** for AWS Forge Industrial Safety. Firebase green / Inter / Tailwind shell rematching is **rejected**. See [industrial-visual-source-of-truth.md](./industrial-visual-source-of-truth.md).

Default palette (do not replace with Firebase `#8bc53f`):

| Token                             | Value                                         |
| --------------------------------- | --------------------------------------------- |
| Primary                           | `#696cff`                                     |
| Primary hover                     | `#5f61e6`                                     |
| Secondary                         | `#8592a3`                                     |
| Success / Info / Warning / Danger | `#71dd37` / `#03c3ec` / `#ffab00` / `#ff3e1d` |
| Body bg / text                    | `#f5f5f9` / `#697a8d`                         |
| Font                              | Public Sans                                   |

Tenant branding may override approved tokens (e.g. logo URL, optional primary) without abandoning Sneat component semantics.

## License

Sneat Free is distributed under the **MIT License** by ThemeSelection.
See [LICENSE excerpt below](#mit-license-excerpt) and the upstream
[themeselection/sneat-html-admin-template-free](https://github.com/themeselection/sneat-html-admin-template-free) repository.

Product page (historical): https://themeselection.com/products/sneat-free-bootstrap-html-admin-template/

Retain the MIT notice in redistribution of derived token values.

### MIT license excerpt

```
MIT License

Copyright (c) 2021 ThemeSelection (https://themeselection.com/)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Theme classes

- Prefer `class="forge-theme-light"` on `<html>` for product UIs (overrides `prefers-color-scheme` auto-dark).
- RMS also sets `data-fx-theme="light"` for FX component tokens.
- Dark theme available via `.forge-theme-dark` / `data-fx-theme="dark"` when needed.
