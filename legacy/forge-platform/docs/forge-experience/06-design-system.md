# FX Design System

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 2)

Every component inherits from this design system. All visual values come from [design tokens](./05-design-tokens.md).

## Document standard template

Every design standard below includes:

1. Purpose
2. Behavior
3. Variants
4. Accessibility
5. Responsive behavior
6. Examples
7. Anti-patterns

---

## Typography

**Purpose:** Establish hierarchy that reads as Mission Control — clear, calm, scannable.  
**Behavior:** Use type tokens only (`typography.display.*` through `typography.monospace`). One primary face for UI; display face for titles; mono for IDs/logs.  
**Variants:** Display XL/L · Heading XL–S · Body L/M/S · Caption · Label · Monospace.  
**Accessibility:** Body text ≥ 14px equivalent; contrast AA; do not lock meaning to weight alone.  
**Responsive:** Reduce display steps one level on phone; keep body.medium readable.  
**Examples:** Page title → `heading.xl`; table cells → `body.small`; field label → `label`.  
**Anti-patterns:** Mixing extra web fonts per product; decorative script faces; all-caps paragraphs.

## Spacing

**Purpose:** Consistent rhythm across shell, cards, forms, and tables.  
**Behavior:** Padding/gap/margin use `space.*` only (4–96 scale).  
**Variants:** Compact (ops tables) vs comfortable (forms) via density modes — still token-based.  
**Accessibility:** Hit targets ≥ 44×44 CSS px on touch.  
**Responsive:** Tighten outer page padding on phone (`space.16`); keep internal control gaps.  
**Examples:** Card padding `space.16`/`space.24`; form field stack gap `space.12`.  
**Anti-patterns:** Magic `13px` gaps; asymmetric padding without a pattern reason.

## Grids

**Purpose:** Align content across desktop, tablet, phone, and operations displays.  
**Behavior:** 12-column desktop grid; collapse to 4/8 on smaller breakpoints; `ResponsiveGrid` component owns gutters (`space.16`/`space.24`).  
**Variants:** App content grid · dashboard tile grid · form two-column grid.  
**Accessibility:** Reading order follows DOM, not visual columns alone.  
**Responsive:** See breakpoint tokens; operations display may widen max content width.  
**Examples:** Dashboard 3×N metric cards; record form 2-col on desktop / 1-col phone.  
**Anti-patterns:** Absolute positioning for primary layout; overlapping columns on tablet.

## Cards

**Purpose:** Group related operational content without becoming “dashboard clutter boxes.”  
**Behavior:** Surface + border + optional elevation; header/body/footer slots; clickable cards use button/link semantics.  
**Variants:** Static · Interactive · Metric · Record · Dashboard.  
**Accessibility:** Interactive cards are keyboard focusable; no nested interactive traps.  
**Responsive:** Full-bleed width on phone; maintain readable internal spacing.  
**Examples:** Metric Card on dashboard; Record Card in search results.  
**Anti-patterns:** Cards inside cards for decoration; hero marketing cards in ops apps.

## Buttons

**Purpose:** Primary path to action — clear, consistent, scarce.  
**Behavior:** One primary action per view region; loading replaces label with busy state; never disable without explanation.  
**Variants:** Primary · Secondary · Danger · Icon · Floating Action.  
**Accessibility:** Name from visible text or `aria-label`; focus ring `color.border.focus`.  
**Responsive:** Full-width primary on phone for critical flows when pattern requires.  
**Examples:** Save (primary); Cancel (secondary); Delete (danger + confirm).  
**Anti-patterns:** Multiple competing primaries; icon-only without label on critical actions.

## Forms

**Purpose:** Capture data in service of a **record** — never become the app.  
**Behavior:** Labels above fields; validation on blur/submit; `Validation Summary` at top; preserve record header while editing.  
**Variants:** Single page · Wizard/Stepper · Inline edit · Compact filter form.  
**Accessibility:** Labels associated; errors linked via `aria-describedby`; required indicated in text.  
**Responsive:** Single column on phone; date/time use platform-friendly pickers.  
**Examples:** Inspection edit form; permit request wizard.  
**Anti-patterns:** Placeholder-as-label; clearing the form on minor validation errors.

## Dialogs

**Purpose:** Focused decisions that block the underlying page briefly.  
**Behavior:** Trap focus; Esc closes non-destructive; confirm destructive via Confirmation Dialog pattern.  
**Variants:** Informational · Form · Confirmation · Destructive.  
**Accessibility:** `role="dialog"`, labelled title, restore focus on close.  
**Responsive:** Full-screen sheet on phone for complex dialogs.  
**Examples:** Confirm delete; short reason capture.  
**Anti-patterns:** Nested dialogs; dialogs for primary navigation.

## Drawers

**Purpose:** Secondary context without leaving the record/workspace.  
**Behavior:** Opens from edge; overlays content; Esc closes; does not replace record routing.  
**Variants:** Detail · Filters · Help · Quick create (short).  
**Accessibility:** Focus move into drawer; return on close.  
**Responsive:** Bottom sheet on phone; side drawer on desktop/tablet landscape.  
**Examples:** Filter drawer on tables; related-record peek.  
**Anti-patterns:** Deep multi-step wizards forced into tiny drawers.

## Tables

**Purpose:** Dense operational scanning with clear row actions.  
**Behavior:** Sticky header optional; sortable columns announced; row selection patterns shared; empty/loading states required.  
**Variants:** Standard · Virtual · Compact ops · Selectable.  
**Accessibility:** Proper table headers; keyboard sort; do not use layout-only tables for non-tabular UI.  
**Responsive:** Priority columns + horizontal scroll or card-list transform on phone (pattern-documented).  
**Examples:** Personnel roster; inspection queue.  
**Anti-patterns:** Spreadsheet editing as default UX; unlabeled icon action columns.

## Charts

**Purpose:** Situational awareness, not decoration.  
**Behavior:** Tokenized series colors; legend + value labels; empty/error states.  
**Variants:** Trend · Distribution · Comparison · Sparkline.  
**Accessibility:** Text summary / data table alternative for critical charts.  
**Responsive:** Simplify series on phone; maintain touch tooltips carefully.  
**Examples:** Incidents by week; training completion rate.  
**Anti-patterns:** Rainbow charts; 3D effects; animation that obscures values.

## Maps

**Purpose:** Spatial operations (hydrants, occupancies, apparatus, incidents).  
**Behavior:** Consistent marker status colors from status/priority tokens; legend required; cluster behavior documented.  
**Variants:** Overview · Record-centered · Live ops.  
**Accessibility:** List alternative for mapped entities; keyboard list selection.  
**Responsive:** Map full-bleed with floating toolbar on phone.  
**Examples:** Hydrant map; incident perimeter.  
**Anti-patterns:** Unlabeled custom marker colors; map as sole navigation for essential tasks.

## Timelines

**Purpose:** Chronological truth on a record.  
**Behavior:** Newest orientation configurable; event anatomy fixed (time, actor, action, summary).  
**Variants:** Activity · Audit · Operational.  
**Accessibility:** Ordered list semantics; time as accessible text.  
**Responsive:** Compact event rows on phone.  
**Examples:** Inspection history; incident updates.  
**Anti-patterns:** Freeform chat styling for audit timelines.

## Accordions

**Purpose:** Progressive disclosure of record sections.  
**Behavior:** One or multi-expand per pattern; state persisted only when intentional.  
**Variants:** Single · Multi · Dense.  
**Accessibility:** Button disclosure with `aria-expanded`.  
**Responsive:** Default collapsed on phone for long records.  
**Examples:** Record “Details / Related / Files” sections.  
**Anti-patterns:** Accordion as primary nav replacement.

## Tabs

**Purpose:** Level-3 workspace / record navigation without deeper nav trees.  
**Behavior:** One selected tab; URL-reflectable where routing exists; overflow scroll on narrow.  
**Variants:** Page · Workspace · Record · Underline / enclosed (tokenized).  
**Accessibility:** Tablist/tab/tabpanel pattern; arrow key support.  
**Responsive:** Horizontal scroll tabs on phone — no wrapping chaos.  
**Examples:** Record Overview / Activity / Files.  
**Anti-patterns:** Nested tab sets more than one deep.

## Status pills

**Purpose:** Instant state recognition.  
**Behavior:** Color + label + optional icon; map to `color.status.*`.  
**Variants:** Success · Warning · Danger · Info · Neutral.  
**Accessibility:** Text label always present.  
**Responsive:** Prefer short labels on phone.  
**Examples:** Open · Overdue · Completed.  
**Anti-patterns:** Color-only dots; cryptic abbreviations without tooltip/accessible name.

## Alerts

**Purpose:** Inline page-level or section-level messages.  
**Behavior:** Persistent until dismissed or condition clears; severity from status tokens.  
**Variants:** Info · Success · Warning · Danger.  
**Accessibility:** Appropriate live region for dynamic alerts.  
**Responsive:** Full content width; stack actions vertically on phone.  
**Examples:** “Scanner unavailable in this environment.”  
**Anti-patterns:** Using alerts for every minor tip.

## Toasts

**Purpose:** Transient confirmation of an action.  
**Behavior:** Auto-dismiss for success/info; sticky for errors until dismissed; queue managed.  
**Variants:** Success · Info · Warning · Danger.  
**Accessibility:** Announced politely; do not steal focus for success toasts.  
**Responsive:** Bottom-center or bottom-full on phone.  
**Examples:** “Inspection saved.”  
**Anti-patterns:** Toasts for critical blocking errors that need dialogs.

## Empty states

**Purpose:** Explain absence and offer next action.  
**Behavior:** Title + short guidance + optional primary action; never blank white void.  
**Variants:** No data · No access · No results · First-run.  
**Accessibility:** Meaningful heading structure.  
**Responsive:** Centered single column.  
**Examples:** “No open tasks. Create a task.”  
**Anti-patterns:** Cute illustrations that dwarf the action; joke copy in mission-critical contexts.

## Loading states

**Purpose:** Show progress without fake precision.  
**Behavior:** Prefer skeletons for content regions; spinners for small local waits; block UI only when necessary.  
**Variants:** Page · Panel · Inline · Button busy.  
**Accessibility:** `aria-busy` / polite status where appropriate.  
**Responsive:** Same patterns; avoid full-app spinners on phone when panel skeleton works.  
**Examples:** Table skeleton rows.  
**Anti-patterns:** Indeterminate spinners for >10s without cancel/status.

## Skeleton screens

**Purpose:** Perceived performance while preserving layout.  
**Behavior:** Mirror final content shape; tokenized shimmer using surface tokens.  
**Variants:** Text · Card · Table · Record header.  
**Accessibility:** Mark as loading; avoid announcing every shimmer.  
**Responsive:** Match responsive layout shapes.  
**Examples:** Dashboard card skeletons.  
**Anti-patterns:** Skeleton that does not match final layout (layout shift).

## Error screens

**Purpose:** Fail closed with a clear recovery path.  
**Behavior:** Distinguish not-found, forbidden, and system error; no secret leakage.  
**Variants:** Inline · Full page · Panel.  
**Accessibility:** Heading + description + focus to recovery action.  
**Responsive:** Full-page on phone for fatal route errors.  
**Examples:** 403 permission denied empty state.  
**Anti-patterns:** Stack traces in UI; “something went wrong” with no next step.

## Confirmation dialogs

**Purpose:** Prevent irreversible mistakes.  
**Behavior:** Restate the object and consequence; danger button for destructive; require typed confirm only for extreme cases.  
**Variants:** Soft · Destructive · High-impact.  
**Accessibility:** Focus to title; clear primary/secondary.  
**Responsive:** Full-width actions on phone.  
**Examples:** Delete record; release quarantine (when permitted).  
**Anti-patterns:** Confirmations for harmless navigations.

## Search

**Purpose:** Find people, assets, records, and actions fast.  
**Behavior:** See [13-search-framework.md](./13-search-framework.md). Global entry in shell; permission-safe results.  
**Variants:** Global · Local filter · Command palette.  
**Accessibility:** Combobox pattern; announce result counts.  
**Responsive:** Expand to full-screen search on phone.  
**Examples:** Search occupancy by address.  
**Anti-patterns:** Showing restricted hits as “locked” teasers that leak existence when policy forbids.

## Filters

**Purpose:** Narrow operational queues without burying controls.  
**Behavior:** Chip summary of active filters; clear-all; apply vs instant per density pattern.  
**Variants:** Inline · Drawer · Advanced.  
**Accessibility:** Each filter labeled; chip remove buttons named.  
**Responsive:** Prefer drawer filters on phone.  
**Examples:** Inspections due this week + high priority.  
**Anti-patterns:** Ten visible filter dropdowns above every table by default.

## Breadcrumbs

**Purpose:** Orient within ≤3 navigation levels.  
**Behavior:** Reflect IA levels; last crumb current page (not a link).  
**Variants:** Standard · Collapsed overflow.  
**Accessibility:** `nav` landmark with label “Breadcrumb”.  
**Responsive:** Collapse middle crumbs on phone.  
**Examples:** Operations / Inspections / Inspection detail.  
**Anti-patterns:** Breadcrumbs that mirror database paths (Collections / Tables / …).

## Quick actions

**Purpose:** Role-relevant next actions from shell or record.  
**Behavior:** Short list; permission-gated; keyboard reachable.  
**Variants:** Shell menu · Record header · FAB (mobile).  
**Accessibility:** Menu button + menu items named.  
**Responsive:** FAB or bottom sheet on phone.  
**Examples:** New inspection; Log incident.  
**Anti-patterns:** Dumping entire module menus into quick actions.

## Action menus

**Purpose:** Secondary actions without crowding the header.  
**Behavior:** Kebab/overflow; destructive items separated and labeled.  
**Variants:** Compact · Sectioned.  
**Accessibility:** Arrow-key menu navigation.  
**Responsive:** Same; ensure 44px rows on touch.  
**Examples:** Export · Assign · Archive.  
**Anti-patterns:** Hiding the only primary action in overflow.

## Overflow menus

**Purpose:** Fit actions into limited toolbars.  
**Behavior:** Moves lower-priority actions into “More”; keeps primary visible.  
**Variants:** Toolbar overflow · Tab overflow.  
**Accessibility:** “More actions” accessible name.  
**Responsive:** Earlier overflow on phone.  
**Examples:** Table row overflow.  
**Anti-patterns:** Overflow as a junk drawer with no order.

---

## Related

- [05-design-tokens.md](./05-design-tokens.md)
- [07-component-library.md](./07-component-library.md)
- [24-pattern-library.md](./24-pattern-library.md)
