# Configuration Studio User Guide

Configuration Studio manages versioned tenant configuration for Forge products.

## Open Studio

Creator Console → **Configuration Studio** → Studio home (`/studio`).

Select a tenant first (Select tenant / `?tenantId=`).

## Lifecycle

1. **Ensure defaults** creates draft objects for each namespace.
2. Edit **Payload JSON** for the selected draft.
3. **Save draft** or **New draft**.
4. **Publish** to make configuration effective.
5. **Schedule** for a future effective time.
6. **Compare** two versions.
7. **Rollback** clones an older version and publishes it.
8. **Archive** retires a version.

## Import / export

Studio home supports JSON bundle export/import (`forge.config.bundle.v1`). This is configuration-only — not the Universal Import Platform.

## Permissions

Requires `platform.configuration.update` (and publish permission for publish/schedule/archive/rollback).
