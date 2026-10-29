# Pattern — Edit Record

**Last Updated:** 2026-07-30 · **Author:** FX Program

## Purpose

Edit a record without losing identity, status, or primary actions.

## Scope

In-place and edit-mode flows inside workspace.

## Goals

Record header remains visible; autosave honesty; permission-aware fields.

## Definitions

Edit mode — mutable field state under FX forms.

## Responsibilities

FX: pattern · Product: field policy · Platform: concurrency/ETag if used.

## Examples

Edit occupancy Details tab.

## Best practices

Read Only state when unauthorized; explain why.

## Anti-patterns

Full-page forms that drop workspace chrome.

## Future enhancements

Inline cell edit for approved dense tables only.

## Dependencies

Record · Forms · Security UX.

## Implementation notes

FX-S0 documentation.

## Acceptance criteria

- [x] Pattern documented · [ ] Shared implementation

## Revision history

| Date       | Change  |
| ---------- | ------- |
| 2026-07-30 | Initial |
