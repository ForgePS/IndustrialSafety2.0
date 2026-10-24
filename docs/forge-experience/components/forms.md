# FX Form Components

**Family:** Forms  
**Principle:** Forms support records; they never become the application.  
**See:** [15-forms-framework.md](../15-forms-framework.md)  
**Template:** [_TEMPLATE.md](./_TEMPLATE.md)

### Shared contract (all form controls)

| Section                 | Spec                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| Properties              | `label`, `name`, `value`, `error`, `hint`, `required`, `disabled`, `readOnly` (+ control-specific) |
| States                  | default, focus, filled, error, disabled, read-only                                                 |
| Permissions             | Field-level read-only vs hidden from product policy                                                |
| Accessibility           | Visible label; errors via `aria-describedby`; required in text                                     |
| Keyboard                | Native control keys; Esc closes pickers/menus                                                      |
| Screen reader           | Validation Summary announced on submit failure                                                     |
| Responsive              | Full-width on phone; touch-friendly pickers; 44px targets                                          |
| Anti-patterns           | Placeholder-as-label; inventing one-off inputs                                                     |
| Future extension points | Product field types map into these controls only                                                   |

---

## Text Field

**Purpose:** Single-line text. **Variants:** Default · Prefix/suffix · Password (masked). **Examples:** Badge number.

## Text Area

**Purpose:** Multi-line text. **Variants:** Fixed · Auto-grow (capped). **Examples:** Inspection notes.

## Date Picker

**Purpose:** Date only. **Variants:** Single · Min/max constrained. **Examples:** Due date.

## Time Picker

**Purpose:** Time only. **Variants:** 12h/24h per locale policy. **Examples:** Shift start.

## Date Time Picker

**Purpose:** Combined date and time. **Variants:** Single control · Split. **Examples:** Incident reported at.

## Dropdown

**Purpose:** Single select from options. **Variants:** Default · Searchable. **Examples:** Occupancy type.

## Multi Select

**Purpose:** Multiple options. **Variants:** Checkbox list · Tags. **Examples:** Certifications held.

## Checkbox

**Purpose:** Boolean or multi independent options. **Variants:** Single · Group. **Examples:** Acknowledge statement.

## Radio Group

**Purpose:** Exclusive choice. **Variants:** Vertical · Horizontal. **Examples:** Inspection result pass/fail.

## Toggle

**Purpose:** On/off preference. **Variants:** Default · With label left/right. **Examples:** Email notifications.

## Slider

**Purpose:** Numeric range. **Variants:** Single · Range. **Examples:** Severity scale (with numeric text value).

## Tag Selector

**Purpose:** Tokenized tags. **Variants:** Free-entry · Controlled vocabulary. **Examples:** Record tags.

## Lookup Field

**Purpose:** Generic async record lookup. **Properties:** `+ query`, `resultRenderer`, `onSelect`. **Examples:** Link related record.

## Person Lookup

**Purpose:** People search lookup. **Examples:** Assign inspector.

## Equipment Lookup

**Purpose:** Equipment search lookup. **Examples:** Link SCBA unit.

## Record Lookup

**Purpose:** Typed record lookup (product supplies type). **Examples:** Link occupancy to inspection.

## Address Lookup

**Purpose:** Address search. **Examples:** Occupancy address.

## Image Upload

**Purpose:** Image attach with preview. **Variants:** Single · Multi. **Permissions:** Sensitive images respect product policy. **Examples:** Hydrant photo.

## Document Upload

**Purpose:** Document attach. **Variants:** Single · Multi · Restricted types. **Examples:** Permit PDF.

## Signature Capture

**Purpose:** Capture signature (pointer/touch). **States:** empty, capturing, captured, cleared. **Examples:** Acknowledgement.

## QR Scanner

**Purpose:** Scan QR via device camera. **Responsive:** Full-screen capture on phone. **Anti-patterns:** No manual entry fallback when camera unavailable. **Examples:** Asset QR.

## Barcode Scanner

**Purpose:** Scan barcode. **Examples:** Equipment barcode. **Future extension points:** Hardware wedge input as alternate source.

## Wizard

**Purpose:** Multi-step flow chrome around forms. **Properties:** `steps`, `current`, `onNext`, `onBack`, `onCancel`. **Variants:** Linear · Optional steps. **Examples:** Permit request.

## Stepper

**Purpose:** Step indicator for wizards. **Variants:** Numbered · Named. **Accessibility:** Current step announced. **Examples:** Step 2 of 4 — Hazards.

## Validation Summary

**Purpose:** Top-of-form error list with focus links to fields. **States:** hidden, visible. **Examples:** “3 errors to fix before save.”
