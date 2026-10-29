# FX Data Components

**Family:** Data display  
**Tokens:** surface, border, status, priority, typography, space, elevation  
**Template:** [_TEMPLATE.md](./_TEMPLATE.md)

### Shared contract

| Section                 | Spec                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Permissions             | Mask or omit restricted fields; never leak via tooltips                                      |
| Accessibility           | Tables use headers; critical charts need text alternatives; status/priority never color-only |
| Keyboard                | Row activation Enter; overflow menus arrow-navigable                                         |
| Screen reader           | Announce loading/empty; badge text included in name                                          |
| Responsive              | Card transform or horizontal scroll patterns for tables on phone                             |
| Anti-patterns           | Spreadsheet-as-app; color-only status                                                        |
| Future extension points | Safe column/render registries without forking Table                                          |

---

## Table

**Purpose:** Tabular operational data. **Properties:** `columns`, `rows`, `sort`, `selection`, `empty`, `loading`. **Variants:** Standard · Compact ops · Selectable. **States:** default, loading, empty, error.

## Virtual Table

**Purpose:** Large lists with windowing. **Properties:** same as Table + `rowHeight`, `estimateSize`. **Accessibility:** Announce total row count.

## Record Card

**Purpose:** Compact record summary linking to record framework. **Variants:** Compact · Standard. **Examples:** Search hit.

## Metric Card

**Purpose:** Single KPI. **Properties:** `label`, `value`, `trend?`, `href?`. **Accessibility:** Text alternative for trend.

## Dashboard Card

**Purpose:** Composed dashboard tile. **Variants:** Metric · List · Attention. **Examples:** Overdue inspections tile.

## Timeline

**Purpose:** Chronology on a record. **See:** [18-timeline-framework.md](../18-timeline-framework.md).

## Audit Log

**Purpose:** Immutable-style event list. **Variants:** Compact · Expanded. **Typography:** monospace for IDs.

## Attachment Viewer

**Purpose:** Files/images preview. **Permissions:** Permission-aware; no unauthorized previews.

## Gallery

**Purpose:** Image set. **Keyboard:** Arrow traverse. **Examples:** Occupancy photos.

## Map

**Purpose:** Spatial operations. **Variants:** Overview · Record-centered · Live ops. **Accessibility:** List alternative for entities. **Anti-patterns:** Unlabeled custom marker colors.

## Weather Widget

**Purpose:** Environmental context (non-critical). **States:** loading, available, unavailable.

## Chart

**Purpose:** Situational analytics. **Variants:** Trend · Distribution · Comparison · Sparkline. **Accessibility:** Data table alternative when critical.

## Progress Indicator

**Purpose:** Determinate/indeterminate progress. **Properties:** `value?`, `label` (required). **Variants:** Bar · Spinner · Ring.

## Status Badge

**Purpose:** Status pill. **Maps to:** `color.status.*`. **Variants:** Success · Warning · Danger · Info · Neutral. **Rule:** Color + text (+ optional icon).

## Priority Badge

**Purpose:** Priority pill. **Maps to:** `color.priority.*`. **Variants:** Low · Normal · High · Critical.

## Identity Card

**Purpose:** Person/org summary. **Slots:** Avatar · Name · Meta · Actions.

## Avatar

**Purpose:** Identity glyph. **Variants:** Image · Initials fallback · Group stack.
