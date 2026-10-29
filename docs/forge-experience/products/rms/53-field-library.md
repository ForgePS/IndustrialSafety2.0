# 53 — Field Library

**Date:** 2026-07-30  
**Code:** `apps/rms-web/src/fx/forms/fields.tsx` + `FxField.tsx`

| Component                                              | Purpose                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| FxField                                                | Label, help, hint, required, error/warning/success chrome  |
| FxTextField / FxTextarea / FxNumberField               | Text inputs                                                |
| FxDateField / FxTimeField / FxDateTimeField            | Temporal inputs                                            |
| FxCheckbox / FxSwitch / FxRadioGroup                   | Choice inputs                                              |
| FxSelect / FxMultiSelect / FxSearchSelect / FxCombobox | Selection (presentation; lookup logic stays product-owned) |
| FxFileUpload / FxImageUpload                           | File inputs                                                |
| FxSignature                                            | Canvas presentation stub                                   |
| FxColorPicker                                          | Color input                                                |
| FxValidationSummary / FxInlineError                    | Error presentation                                         |
| FxHelpText / FxFieldHint / FxRequiredIndicator         | Assistive chrome                                           |

Promotion candidates for `@forge/fx-ui`: see platform `44-component-registry.md`.
