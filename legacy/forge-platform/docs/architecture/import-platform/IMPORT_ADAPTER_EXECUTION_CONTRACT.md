# Import Adapter Execution Contract (S5)

Adapters implement `ImportRecordAdapter` and register by stable key:

`{productKey}:{moduleKey}:{recordType}@{version}`

No product-name conditionals in the shared engine.

S5 ships `ReferenceImportAdapter` (`reference:generic:record@1`) for tests and development.
Product adapters (Academy / RMS / Industrial) are out of scope.
