# Pattern — Bulk Operations (Edit / Import / Export)

**Last Updated:** 2026-07-30 · **Author:** FX Program

## Purpose

Multi-item edit, import, and export with shared chrome and per-item authorization.

## Scope

Bulk Edit · Bulk Import · Bulk Export.

## Goals

Transparent progress; partial failure reporting with reference IDs; audit.

## Examples

Export filtered hydrant set to CSV; bulk reassign tasks.

## Anti-patterns

Bulk actions that skip per-item permission validation.

## Dependencies

Tables · Reporting exports · Import Center (product/platform) · Feedback states.

## Acceptance criteria

- [x] Pattern documented

## Revision history

| Date       | Change  |
| ---------- | ------- |
| 2026-07-30 | Initial |
