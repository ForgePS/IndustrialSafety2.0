# Tenant NERIS Configuration

Phase 2 exposes tenant-facing configuration editing in **rms-web** (flag: `rms.neris.tenant_configuration.enabled`). Creator Console schema browsers remain read-only for platform support.

## What tenants may configure

Through overlay and configuration APIs (server-enforced):

| Area                                           | Allowed |
| ---------------------------------------------- | ------- |
| Field labels, help text, favorites             | Yes     |
| Display order within sections                  | Yes     |
| Optional visibility (hide non-required fields) | Yes     |
| Safe defaults                                  | Yes     |
| Value aliases (display only)                   | Yes     |
| Local warnings / supplemental requirements     | Yes     |
| Section grouping and role visibility hints     | Yes     |

## What remains immutable

| Area                              | Policy    |
| --------------------------------- | --------- |
| Official field keys               | Immutable |
| Option codes and payload mappings | Immutable |
| Cardinality and schema conditions | Immutable |
| Published NERIS module structure  | Immutable |

Violations return `400` from overlay/configuration services (Phase 1 enforcement unchanged).

## Configuration vs snapshots

- **Live configuration** drives open incident editing via the effective form descriptor.
- **Configuration snapshots** ([ADR-032](../../architecture/adr/ADR-032-schema-config-snapshots.md)) freeze overlay state at submit and finalize for audit.

## APIs

- Phase 1 overlay services: `NerisConfigurationOverlayService`, tenant overlay tables
- Incident reads: `GET …/configuration-snapshots`

## UI location

`apps/rms-web/src/app/configuration/` — tenant admin surface.

## Deferrals

- Creator Console consolidation onto `@forge/web-kit`
- Bulk import/export of overlay packs
- Per-role field editability matrix beyond starter templates
