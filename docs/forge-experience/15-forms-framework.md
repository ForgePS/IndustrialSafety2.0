# FX Forms Framework

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 3)

All forms inherit common behavior.  
Forms support **records**. Forms must never become the application.

## Ownership

| Layer                                                                | Owner                  |
| -------------------------------------------------------------------- | ---------------------- |
| Control behavior, layout patterns, validation UX, wizard chrome      | **FX**                 |
| Field schemas, business validation, prefills, approval routing rules | **Product / platform** |

Form templates must be **reusable across products** via FX forms patterns and controls ([components/forms.md](./components/forms.md)).

## Supported capabilities

| Capability             | Behavior                                       |
| ---------------------- | ---------------------------------------------- |
| Single Page Forms      | Default for simple records                     |
| Multi-Step Wizards     | Wizard + Stepper chrome                        |
| Tabbed Forms           | Within workspace Details — not a nav tree      |
| Dynamic Sections       | Show/hide sections progressively               |
| Conditional Logic      | Product rules; FX presents resulting UI        |
| Calculated Fields      | Read-only computed presentation                |
| Auto Save              | Draft persistence with clear dirty/saved state |
| Draft Recovery         | Restore after interrupt                        |
| Version History        | When platform versions form data               |
| Approval Routing       | Hands off to workflow/approvals UX             |
| Digital Signatures     | Signature Capture control                      |
| Image Upload           | FX upload control                              |
| Document Upload        | FX upload control                              |
| Barcode Scanning       | Barcode Scanner control + fallback entry       |
| QR Scanning            | QR Scanner control + fallback entry            |
| Offline Completion     | With Offline Framework state honesty           |
| Validation Rules       | Field + summary errors                         |
| Prefill Rules          | Product-supplied values                        |
| Cross-field Validation | Surfaced in Validation Summary                 |
| Related Record Lookup  | Lookup controls                                |

## Behavior standards

- Record title/status remain visible while editing (workspace header)
- Labels above fields; placeholder is never the only label
- Validation Summary at top on submit failure; focus moves to first error
- Auto-save must never imply server commit when only local draft exists
- Destructive clears require confirmation

## Accessibility

- Associated labels; `aria-describedby` for errors/hints
- Required indicated in text
- Wizard steps announced
- Scanner flows keyboard/manual fallback

## Responsive

- Single column on phone
- Wizard steps full-width
- Touch-friendly targets (`space` + 44px)

## Anti-patterns

- Product-specific form engines
- Placeholder-as-label
- Multi-step flows without Stepper
- Hiding Validation Summary
- Offline UI that looks identical to online committed state

## Related

- [components/forms.md](./components/forms.md)
- [16-record-framework.md](./16-record-framework.md)
- [11-workspace-framework.md](./11-workspace-framework.md)
- [20-offline-framework.md](./20-offline-framework.md)
- [28-workflow-framework.md](./28-workflow-framework.md)
