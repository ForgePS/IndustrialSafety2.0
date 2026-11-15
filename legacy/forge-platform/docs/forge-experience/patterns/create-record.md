# Pattern — Create Record

**Last Updated:** 2026-07-30 · **Author:** FX Program

## Purpose

Start a new operational record using shared workspace/forms chrome.

## Scope

All products creating domain records via FX.

## Goals

Consistent create entry (Quick Action, list CTA, FAB on mobile).

## Definitions

Draft — unsaved or auto-saved pre-commit record.

## Responsibilities

FX: chrome/pattern · Product: schema/rules · Platform: persistence.

## Examples

New inspection from Operational Dashboard Quick Actions.

## Best practices

Land in workspace with Draft status; show Validation Summary on submit.

## Anti-patterns

Module-specific create wizards that bypass FX Wizard/Forms.

## Future enhancements

Type picker with recent/favorites.

## Dependencies

Forms · Workspace · Workflow (Draft).

## Implementation notes

Docs/prototypes only in FX-S0.

## Acceptance criteria

- [x] Pattern documented · [ ] Implemented in shared package

## Revision history

| Date       | Change  |
| ---------- | ------- |
| 2026-07-30 | Initial |
