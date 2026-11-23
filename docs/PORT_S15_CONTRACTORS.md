# Port slice 15: Contractor Safety

1.0 had no real contractor module. Under `legacy/forge-platform`, `industrial-domain.service.ts` treated "contractors" as one more generic record type with a title and a free-text status, and no workflow. So this slice is built from the parity matrix row ("contractor companies, workers, onboarding, insurance, qualifications, orientations, … documents, status and performance"), not as a port of 1.0 screens.

The 2.0 menu: Compliance Programs → **Contractor Safety** (`/contractors`).

## What it does

- **Companies** (`/contractors`, `/contractors/new`, `/contractors/[id]`, `/contractors/[id]/edit`):
  - Fields: name, trade, contact (name, email, phone), a sponsor (an active member of the company), the sites it may work at (none ticked = any site), EMR, TRIR and notes.
  - The list shows status, whether the company is cleared to work, active worker count and sites. It filters by status and has an archived view.
  - **Approval:** new companies start **pending**. Someone with `contractor_safety.approve` approves, suspends or deactivates a company, or moves it back to pending. Suspending or deactivating needs a reason, which is shown on the company. If a company is approved while documents are still missing, the approver is told its workers can't sign in yet.
  - A company can be archived (not while any of its workers are signed in) and restored.
- **Documents:**
  - Types: general liability, workers' comp, auto liability, umbrella / excess, written safety program, business or trade license, W-9, and other.
  - Insurance needs an expiration date and can have a coverage amount. "Other" needs a title.
  - A file (PDF, JPEG, PNG or WebP, up to 12 MB) is optional. The type is checked from the file's first bytes. Files are stored privately in `forge-contractors` and opened through a five-minute signed link.
  - Removing a document keeps it in the history ("Show removed").
- **Cleared to work** is computed from the record, never stored:
  - A **company** is cleared when it's approved and has every required document (set in Settings; general liability and workers' comp by default) on file, in effect and not expired. The newest certificate of each type that is already in effect counts; a renewal with a future effective date doesn't count until that date ("not in effect until …"). Documents expiring within the warning window (30 days by default) and expired optional documents are warnings.
  - A **worker** is cleared when they're active, their company is cleared, their site orientation is done and not expired (12 months by default), and no **required** qualification has expired. Optional qualifications that lapse are warnings.
  - Pages show the reasons: for example, "Company: General liability insurance missing" or "Site orientation not done".
- **Workers** (`/contractors/workers/new?company=…`, `/contractors/workers/[id]`):
  - Fields: name, email, phone, trade, badge number (upper-cased, unique in the company), active, and the date site orientation was completed (who recorded it is kept).
  - **Training and certifications:** a name, issue and expiry dates, and whether it's required to work.
  - The worker page shows standing, when orientation runs out, and their last 50 site visits.
- **Site sign-in** (`/contractors/on-site`):
  - Pick the worker and location, with an optional host and purpose.
  - The server decides. A worker who isn't cleared, or whose company isn't approved for that site, is refused with the reasons.
  - Someone who can manage contractors at that location can sign them in anyway with an **override reason**. The reason, and the problems at that moment, stay on the visit and show on the on-site list.
  - A worker can only have one open visit. **On site now** lists everyone signed in at your locations, with sign-out. The companies page shows the count.
- **Settings** (`/contractors/settings`): the required documents, how long orientation lasts (1–60 months), and the warning window (1–180 days).

## Scope

- A company with no sites listed may work anywhere, and everyone with view access sees it. A company with sites is visible to location-scoped people at any of those sites.
- A location-scoped manager can only change companies whose sites are all theirs. A company allowed at any site needs company-wide permission to change.
- Sign-in desks only sign people in and out at their own locations. Overrides also need manage permission at that location.

## Permissions

- `contractor_safety.view`: see companies, documents, workers and standing. Scopeable.
- `contractor_safety.sign_in`: sign workers in and out, and see who is on site. Scopeable.
- `contractor_safety.manage`: add and edit companies, documents, workers and qualifications, and override a refused sign-in. Scopeable.
- `contractor_safety.approve`: approve, suspend or deactivate companies. Sensitive; needs confirmation.
- `contractor_safety.settings`: change the requirements.
- **Grants:**
  - Read-only: view, company-wide.
  - Supervisors: view and sign-in, at location scope.
  - Location administrators: view, sign-in and manage, at location scope.
  - Safety managers, company admins, company administrators and owners: everything, company-wide.
  - Employees: none.

## Schema

`20261119160000_s15_contractors.sql`:
- **Feature and menu:** the `contractor_safety` feature, with plan entitlements (internal-demo, enterprise), and the menu entry `nav.contractor_safety` under Compliance Programs.
- **Tables:**
  - `forge_contractor_settings`: one row per company; defaults apply when there's none.
  - `forge_contractor_companies`: one active company per name (any case), with checked status, email and rates.
  - `forge_contractor_documents`: insurance needs an expiry; "other" needs a title; file columns are all set or all empty.
  - `forge_contractor_workers`: one active badge number per company.
  - `forge_contractor_qualifications`
  - `forge_contractor_visits`: one open visit per worker; an override reason needs its recorded problems, and the other way round.
  - All have RLS on, no anon or authenticated access, and service role only.
- **Storage:** the private `forge-contractors` bucket (12 MB).
- **Trigger `forge_contractor_same_organization`:**
  - The sponsor must be an active member, and the sites must belong to the company.
  - Documents, workers, qualifications and visits stay in one company.
  - A visit's contractor company is its worker's company.
  - A worker can't move to another contractor company.
  - A visit can only be closed, once, with a sign-out time; nothing else on it changes.

## Tests

- **Unit:** `node --experimental-strip-types --test apps/web/tests/port-s15-contractor-rules.test.cjs` (8). Covers dates and expiry, settings, the company, document, worker and qualification forms, company and worker standing, and sign-in decisions.
- **Database:** `node apps/web/tests/port-s15-contractors-db.cjs`. Covers company, document, worker, visit and settings checks, one company, a fixed worker company, one open visit, sign-out once, no direct access, the private bucket, and permissions and grants.
- **Playwright:** `port-s15-contractors.spec.cjs` (4). Covers:
  - a pending company and a worker who isn't cleared;
  - a refused sign-in, then an override with a reason;
  - a PDF certificate and a workers' comp record, approval and orientation, after which the company and worker are cleared, the file opens, and sign-in needs no override;
  - an employee kept out of every page and the file route.
- **Not in CI:** like slices 8–14, these aren't in the CI workflow yet.

## Remaining

- Expiry reminders: a cron emailing sponsors and managers before insurance, orientation or required training lapses.
- Contractor performance evaluations, and a contractor link on incidents and corrective actions.
- Work permits (hot work, confinement) tied to a visit.
- Contractor self-service: a portal or link for uploading certificates and taking orientation.
- Feeding who is on site into the emergency roll call (slice 14).
- Kiosk or QR sign-in at the gate.
- 1.0 data migration: 1.0's generic contractor records.
