# @forge/imports

Shared **Universal Import Engine** skeleton for Forge Platform.

- Product-agnostic types, validation rule kinds, duplicate actions
- Stage interfaces: detect → map → validate → duplicate → preview → execute → rollback
- Stubs throw `NOT_IMPLEMENTED` until implementation sprints

Architecture: `docs/architecture/import-platform/`

Do not place Academy / RMS / Industrial business logic in this package.
