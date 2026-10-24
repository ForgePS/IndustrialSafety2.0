# FX Action Components

**Family:** Actions  
**Tokens:** `color.action.*`, typography.label/body, space, radius, motion, elevation  
**Template:** [_TEMPLATE.md](./_TEMPLATE.md)

Shared rules for all action components:

- **Permissions:** Prefer omit unauthorized actions; if shown disabled, provide reason
- **Accessibility:** Visible name or `aria-label`; focus ring via `color.border.focus`
- **Keyboard:** Enter/Space activate; Esc closes menus/dialogs
- **Screen reader:** Announce loading/busy; dialogs labelled by title
- **Responsive:** Critical primary CTAs may go full-width on phone; FAB on field/phone
- **Anti-patterns (family):** Multiple competing primaries; icon-only for irreversible actions
- **Future extension points:** Product icons only from FX icon set; no one-off button skins

---

## Primary Button

| Section       | Spec                                                           |
| ------------- | -------------------------------------------------------------- |
| Purpose       | Main commit action for a view region                           |
| Properties    | `label`, `busy`, `disabled`, `type`, `onPress`, `leadingIcon?` |
| Variants      | Default · Quiet-on-inverse                                     |
| States        | default, hover, focus, active, disabled, loading               |
| Examples      | Save · Submit for approval                                     |
| Anti-patterns | Two primaries in the same header                               |

## Secondary Button

| Section       | Spec                                             |
| ------------- | ------------------------------------------------ |
| Purpose       | Alternative or cancel path                       |
| Properties    | Same as Primary with `tone="secondary"`          |
| Variants      | Default · Quiet                                  |
| States        | default, hover, focus, active, disabled, loading |
| Examples      | Cancel · Back                                    |
| Anti-patterns | Using secondary for the only important action    |

## Danger Button

| Section       | Spec                                                     |
| ------------- | -------------------------------------------------------- |
| Purpose       | Destructive commit                                       |
| Properties    | Same as Primary with `tone="danger"`                     |
| Variants      | Default · Outline                                        |
| States        | default, hover, focus, active, disabled, loading         |
| Examples      | Delete · Void permit                                     |
| Anti-patterns | Danger without Confirmation Dialog for irreversible work |

## Icon Button

| Section       | Spec                                                                    |
| ------------- | ----------------------------------------------------------------------- |
| Purpose       | Compact toolbar/action                                                  |
| Properties    | `aria-label` (required), `icon`, `tone`, `busy`, `disabled`, `pressed?` |
| Variants      | Standard · Toggle · Danger                                              |
| States        | default, hover, focus, active, disabled, loading, pressed               |
| Examples      | Overflow · Favorite                                                     |
| Anti-patterns | Missing accessible name                                                 |

## Floating Action Button

| Section       | Spec                                                   |
| ------------- | ------------------------------------------------------ |
| Purpose       | Primary create/action on phone and field surfaces      |
| Properties    | `label` or `aria-label`, `icon`, `onPress`, `disabled` |
| Variants      | Icon · Extended (label visible)                        |
| States        | default, hover, focus, disabled                        |
| Examples      | New inspection (field)                                 |
| Anti-patterns | Multiple FABs; FAB on dense desktop tables as default  |

## Action Menu

| Section       | Spec                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| Purpose       | Secondary actions grouped under a trigger                                   |
| Properties    | `trigger`, `items[]` (`label`, `tone`, `disabled`, `onSelect`), `sections?` |
| Variants      | Compact · Sectioned                                                         |
| States        | closed, open, item focus                                                    |
| Examples      | Export · Assign · Archive                                                   |
| Anti-patterns | Hiding the only primary action in the menu                                  |

## Confirmation Dialog

| Section       | Spec                                                                            |
| ------------- | ------------------------------------------------------------------------------- |
| Purpose       | Confirm irreversible or high-impact actions                                     |
| Properties    | `title`, `body`, `confirmLabel`, `cancelLabel`, `tone`, `onConfirm`, `onCancel` |
| Variants      | Soft · Destructive · High-impact (typed confirm when required)                  |
| States        | open, confirming/busy                                                           |
| Examples      | Delete record                                                                   |
| Anti-patterns | Confirming harmless navigation                                                  |

## Quick Actions

| Section       | Spec                                            |
| ------------- | ----------------------------------------------- |
| Purpose       | Role-relevant next actions from shell or record |
| Properties    | `items[]` (permission-filtered), `placement`    |
| Variants      | Shell menu · Record header · FAB                |
| States        | default, open                                   |
| Examples      | New inspection · Log incident                   |
| Anti-patterns | Dumping entire module IA into quick actions     |
