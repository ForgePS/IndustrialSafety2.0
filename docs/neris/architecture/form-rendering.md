# Schema-Driven Form Rendering

Phase 2 intake renders NERIS fields from a server-composed descriptor rather than hard-coded forms ([ADR-034](../../architecture/adr/ADR-034-effective-form-descriptor.md)). Phase 3 adds specialty workflow activation so only applicable fire/specialty sections appear ([specialty-workflows.md](./specialty-workflows.md)).

## Data flow

1. Client loads incident + `GET …/form-descriptor`.
2. `IncidentFormDescriptorService` merges:
   - Published registry modules/fields (Phase 1)
   - Tenant field and value overlays
   - Condition rules (`NerisConditionEngine`) with **live** field values
   - Tenant NERIS configuration (`NerisConfigurationOverlayService`)
   - Specialty workflow evaluation (classification + field signals)
3. rms-web maps each field to a component by data type / render hint and builds navigation from `navigationSections`.

## Supported render patterns

| Pattern                                       | Source                                   |
| --------------------------------------------- | ---------------------------------------- |
| Text / number / boolean / timestamp           | Registry data type                       |
| Select / multi-select                         | Value sets via `NerisValueSetService`    |
| Searchable / hierarchical selects             | Value set hierarchy APIs                 |
| Person / unit / apparatus / occupancy lookups | RMS master-data APIs                     |
| Repeatable cards                              | Repeatable group/item APIs               |
| Conditional visibility                        | Condition engine evaluation              |
| Specialty section activation                  | `@forge/neris` specialty workflow engine |

## Specialized workspace steps

Layout wrappers (not alternate storage):

| Step                                                                    | Maps to sections / fields                   |
| ----------------------------------------------------------------------- | ------------------------------------------- |
| Overview                                                                | `OVERVIEW`, basics                          |
| Dispatch                                                                | `DISPATCH`, timestamps                      |
| Location                                                                | `LOCATION`, addresses                       |
| Units & personnel                                                       | `UNITS_PERSONNEL`, roster-driven assignment |
| Classification                                                          | `CLASSIFICATION` (+ optional specialty add) |
| Fire / Structure / Wildland / Hazmat / Rescue / Explosion               | Specialty groups                            |
| Exposures / Casualties / Alarm / Protection / Emerging / CRR / Analysis | Specialty groups                            |
| Narrative                                                               | `NARRATIVE`                                 |
| Attachments                                                             | `ATTACHMENTS`                               |
| Review                                                                  | `REVIEW`, validation summary                |

`APPLICABLE_MODULES` is no longer used as a dump bucket for all NERIS fields.

Official field key mappings are covered by rms-web unit tests and validation runs.

## Overlay behavior

Tenant overlays may change labels, help text, favorites, display order, optional visibility, safe defaults, aliases, and local warnings. They cannot change official codes, payload mappings, cardinality, or schema conditions (server-enforced).

## Client package

Shared API/auth/list helpers live in `@forge/web-kit`. Creator Console continues using local copies until a later consolidation pass.
