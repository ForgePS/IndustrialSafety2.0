# Forge Waypoint: area intelligence

> **Every area of your facility has a Waypoint. Scan it, and you know everything about the ground you're standing on.**

Walkthrough "facility mapping" tools treat areas as a notebook: a safety professional walks the floor, writes notes and maps them to areas later. Waypoint makes **the area itself the record**. It stays current, anyone who scans its sticker can see it, and lockouts, issues and equipment status roll up to it automatically.

Phase 0 (this slice) ships **Areas**, **Area Cards** (a QR posted at the entrance) and the **"Before you enter"** brief with a live status light.

## Phases

| Phase             | Scope                                                                                                                                                                                      | State                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| **0: Area Card**  | Area records, equipment placement, area QR target, "Before you enter" brief, status light from lockouts / out of service / open issues, report an issue from the area                      | **Built** (this slice) |
| 1: Who's entering | Training check when the scanner identifies ("You're cleared" / "Missing: Forklift cert"), SDS for chemicals stored here, permits (hot work, confined space) on the status light, PPE icons | Planned                |
| 2: Rounds         | Proof-of-presence rounds (scan each Area Card), quick-capture findings with photo markup, offline sync, per-area round report                                                              | Planned                |
| 3: Map + AI       | Floor plan with areas and pins, findings heat map, area health score, AI-drafted findings with suggested OSHA citations (human-confirmed)                                                  | Planned                |
| 4: Responder view | Area hazards, chemicals, shutoffs and occupancy exposed to Forge CAD/RMS pre-plans (public-safety crossover)                                                                               | Planned                |

Open questions: can an area also be a line, cell or vehicle? Do contractors and visitors need a light sign-in that captures acknowledgment? Is the public CFR text enough for citation suggestions? Brady label printing: partner or compete?

## Data

Migration `20261123100000_waypoint_areas.sql`:

| Table / change                            | Holds                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `forge_areas`                             | An area at one location: name, optional code, description, hazards and required PPE (lookup keys), restricted entry and entry requirements, and emergency info (nearest exit, muster point, eyewash, extinguisher, first aid / AED, notes). Archive only: `archived_at`, `archived_by`, `archive_reason`. Active names are unique per location and active codes per company (case-insensitive). |
| `forge_area_activity`                     | The area's history: created, updated, archived, restored, equipment added / removed, Area Card QR created.                                                                                                                                                                                                                                                                                      |
| `forge_assets.area_id`                    | Which area the equipment is in. A trigger requires the same company, the same location and an active area. Moving equipment to another location takes it out of its area.                                                                                                                                                                                                                       |
| `forge_qr_codes`                          | Target type `area` added. The target guard checks the area belongs to the same company. Area QRs must use the scan menu. An area with QR codes can't be deleted, only archived.                                                                                                                                                                                                                 |
| `forge_qr_issue_reports.area_id`          | Issues reported from an Area Card keep the area.                                                                                                                                                                                                                                                                                                                                                |
| Lookups `waypoint.hazard`, `waypoint.ppe` | 12 hazards and 11 PPE items. Tenants change them in the Dropdown Manager.                                                                                                                                                                                                                                                                                                                       |

Both new tables are server-only (RLS on, no anon / authenticated access). Every page and action loads through the service role after a permission and scope check.

## Permissions

| Permission        | Granted to                                                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `waypoint.view`   | Standard users, read-only users and employees (organization scope). Supervisors and location admins (location scope). Safety managers and company admins / owners (organization scope). |
| `waypoint.manage` | Supervisors and location admins (location scope). Safety managers and company admins / owners (organization scope).                                                                     |

Creating an Area Card also needs `qr_management.create`. Location scope limits both the list and every action. An area at another company, or outside the user's locations, returns 404.

## Screens

- **Waypoint** (`/waypoint`, nav "Facility & Operations Safety"): areas with status light, location, PPE, equipment and Area Card counts. Filter by location, search, show archived.
- **New / edit area** (`/waypoint/new`, `/waypoint/<id>/edit`): name, code, location, description, PPE and hazard chips from the lookups, restricted entry, entry requirements and emergency info. The location can't change while equipment is placed in the area.
- **Area page** (`/waypoint/<id>`): the Area Card preview, equipment panel (add equipment at the same location, remove), Area Card QR list, history, archive / restore. Archiving releases the equipment and archives the area's QR codes; restoring brings the area back without them.
- **Create Area Card QR** (`/qr/create?area=<id>`): QR Management with the area preselected, named "Area Card · <area>", employee-number access by default.

## Area Card (`/scan/<token>`)

The existing scan page shows the brief above the scan menu:

1. **Status light**
   - **Stop — check before entering** (red): restricted entry, or any equipment in the area is locked out now.
   - **Caution** (amber): equipment out of service, or open issues (open Corrective Actions from scan reports on the area or its equipment).
   - **Clear** (green): none of the above.
   - Reasons are listed most serious first.
2. **Required PPE**, **Hazards**, **Before entering**.
3. **Equipment in this area** with its status, linking to each item's own scan menu.
4. **In an emergency**: exit, muster point, eyewash, extinguisher, first aid, notes.

Anonymous viewers (no sign-in, no employee number) see the status light with counts only ("1 piece of equipment is locked out now"), the PPE, hazards and emergency info. They never see equipment names, and are asked to identify themselves for the list. On "Signed-in users only" QRs the brief is hidden until sign-in.

The scan menu for an area works like a location QR: report an issue, daily / weekly / monthly inspections and linked forms. Issue reports create a Corrective Action, carry the area, and show as "Area · Location" in Scan issues.

## Tests

- `apps/web/tests/waypoint-rules.test.cjs` (unit): status light, anonymous wording, input validation and lookups, change tracking, emergency rows, the area scan menu.
- `apps/web/tests/waypoint-db.cjs` (database): tenant guards on areas, equipment placement rules, area QR targets, archive-only deletion, uniqueness, lookups and grants, no direct table access.
- `apps/web/tests/waypoint.spec.cjs` (Playwright): create an area, place equipment, create the Area Card, scan it signed in and anonymously, report an issue (amber light), archive (card stops working) and restore, and a cross-tenant 404.

## Not in phase 0

- **AI context:** Forge AI doesn't read areas yet.
- **Notifications:** no area-specific notices. Issue reports from an Area Card use the existing Scan issues notices.
- **Asset form:** equipment is placed from the area page; the asset form has no area field yet.
- Everything in phases 1–4 above.
