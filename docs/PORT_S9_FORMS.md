# Port slice 9: Forms (Industrial 1.0 → 2.0)

2.0 had form configuration for its fixed module records (incident, inspection, CAPA and so on) but no company forms: nobody could build a form of their own or fill one in. This slice ports 1.0's Forms module:
- the company form library and builder;
- filling forms and the submissions workspace;
- signatures, with the EHS Director gate and remote sign links;
- print;
- import of 1.0's forms and submissions.

The module record forms (`forge_form_definitions`, `getEffectiveForm`) are unchanged and separate.

1.0 reference (under `legacy/forge-platform/apps`):
- **Desktop UI:** `industrial-web/src/components/forms-workspace.tsx`, `lib/forms-module.ts`, `lib/form-yesno.ts`, `lib/form-checklist-import.ts`.
- **Field app:** `field-web/src/lib/field-forms.ts`, `components/field-form-runner.tsx`.
- **API:** `platform-api/src/modules/industrial/form-signatory.ts`, `form-print.ts`, `form-catalog-import.ts`, `form-subject.ts`, and `industrial-domain.service.ts` (~3068–3240 submissions, ~3885 director notice, ~4073–4136 sign links).

## Data

Migration `apps/web/supabase/migrations/20261117130000_s9_forms.sql`:

| Table | Holds |
| --- | --- |
| `forge_form_templates` | A company's forms: title, category, status (draft / active / archived), the builder's working copy (`schema`), the current published version, an optional location / division, and the 1.0 source id for re-import. |
| `forge_form_template_versions` | Published versions. A trigger refuses every update, so a version never changes once published. |
| `forge_form_submissions` | Submissions numbered `FRM-<year>-000001`, pinned to the version they were filled on. Holds answers, status (draft / pending_signature / submitted / archived), subject person, location, division, submitter and `row_version`. |
| `forge_form_sign_requests` | Remote sign links. Only the sha256 of the token is stored. |
| `forge_form_submission_activity` | The history shown on a submission. |

- Members can read templates and versions.
- Submissions, sign requests and activity are written and read only by the server, after the app's permission and scope checks. Anonymous callers and members get nothing directly; the DB test checks this.
- Signatures are stored in the answers as `{image, signedAt, signedByName, signedByUserId, method}`, where `method` is `in_app`, `remote_link` or `imported`.

## Permissions

| Permission | Employee | Supervisor / location admin | Safety manager, company admin / owner |
| --- | --- | --- | --- |
| `forms.view`: library and submissions | own | location | organization |
| `forms.submit`: fill out | own | location | organization |
| `forms.edit`: edit others' submissions | | location | organization |
| `forms.export`: print | own | location | organization |
| `forms.sign_director`: sign as EHS Director | | | organization |
| `forms.manage`: build, publish, import, archive templates | | | organization |
| `forms.archive`: archive submissions | | | organization |

- The read-only role gets `forms.view` for the whole company.
- **Scope** (`forgeFormAccess.ts`):
  - Organization scope sees every submission.
  - Location or division scope sees submissions at your locations or divisions.
  - Every scope also includes your own submissions: ones you created or submitted, or ones about you (subject person).
- A submission outside your scope answers 404.
- 1.0 limited the EHS Director signature to a Safety Director role. 2.0 makes it the `forms.sign_director` permission.

## Library and builder

- **`/forms`** lists active forms, with search and a category filter. Each form has Fill out and, if you can print, Print blank.
  - Tabs: Forms, Submissions and, with `forms.manage`, Manage templates (drafts and archived too).
- **`/forms/templates/new` and `/forms/templates/<id>`** (`forms.manage`):
  - Details: title, description, category, and an optional location and division.
  - Field editor: add, remove and move fields.
  - Field types: short and long text, number, date, time, email, phone, dropdown, multiple choice (one or many), checkbox, Yes / No / N/A (with a note required on No), signature (anyone / supervisor / EHS Director), photo, location, employee number, section heading and instructions text.
  - Each field has: required, options, help, and "show only when" another field above it has a given answer.
  - **Quick text mode** is 1.0's `id|label|type|required|options` lines, with options separated by `;`. It also reads 1.0's older style.
  - Preview and a problems list.
- **Save draft** keeps the working copy.
  - **Publish** creates the next version. It is refused when the form has problems or no answerable fields.
  - People fill the latest published version. The builder says when there are unpublished changes.
  - Field ids stay fixed once saved, so old answers still match after a field is renamed.
- **Archive, Restore and Duplicate.** An archived form can't be filled; its submissions stay.
- **Import checklist** (`/forms/templates/import`) turns a CSV into a draft, following 1.0's checklist import:
  - Questions become required Yes / No / N/A fields.
  - Section headings are inserted where the section changes.
  - A sheet with label and type columns is read as a field list.
  - **Excel files must be saved as CSV first;** 2.0 has no Excel library.

## Filling and submissions

- **`/forms/fill/<form>`** (`forms.submit`): fills the latest published version, with an optional location and division.
  - **Save draft** checks formats only.
  - **Submit** also checks required fields and No notes.
  - Photos: up to 5 per field, JPG / PNG / WebP up to 10 MB, checked by content. They are stored privately as evidence on the submission and opened through short-lived links.
- **Employee number** links the submission to that person (1.0 form-subject). Their location and division are used when none is chosen.
- **Status:**
  - Submitting gives **Submitted**.
  - It gives **Needs signature** (pending_signature) while a supervisor or EHS Director signature is missing.
  - When the last one is signed it becomes Submitted.
- **`/forms/submissions`** (`forms.view`, scoped):
  - Search by number or title.
  - Filters: status (including Needs signature), form, location and date range.
  - Group by form.
- **`/forms/submissions/<id>`:** answers, signatures, photos, the subject person, history, and the signature panel. Buttons: Edit, Print and Archive.
- **Edit** (`/forms/submissions/<id>/edit`) is open to the creator, or to `forms.edit` within scope. 1.0 allowed editing and re-saving submitted forms; so does 2.0.
  - Supervisor and EHS Director signatures can't be added or changed by editing. Whatever the browser sends for them is replaced by the stored value; they are only written by signing.
  - A drawn "anyone" signature is stamped on the server with the time and the user.
- Saving is protected against two people editing at once (`row_version`).
- Audit entries never include answers or signature images.

## Signatures

The **signature panel** on a submission lists the supervisor and EHS Director fields, signed or waiting.

| Field | Who can sign in the app | By link |
| --- | --- | --- |
| EHS Director | a user with `forms.sign_director` covering the submission | the requested user must be **signed in** (the link sends a signed-out visitor to login and back) |
| Supervisor | `forms.edit` within scope, or the person a link was sent to | **no sign-in**, as in 1.0: the signer types their name |
| Anyone | the creator / submitter, or `forms.edit` within scope | n/a |

- **Send link to sign** (`forms.edit` within scope) works only while the form needs a signature.
  - You pick from the eligible signers:
    - **Supervisor field:** people and members at the submission's location, plus `forms.edit` holders.
    - **EHS Director field:** `forms.sign_director` holders.
  - The signer gets an in-app notice and an email with the link.
  - The link is shown once with Copy, is valid 14 days, is single use, and can be revoked.
  - A new link for the same field replaces the old one.
- **The public page `/sign/<token>`** shows only the company, the form title, the submission number, the answers and the field to sign.
  - Invalid, expired, revoked, used and "no longer waiting" links each get their own message.
  - The POST endpoint accepts same-origin requests only.
- **Re-signing** needs Clear first: `forms.edit`, plus `forms.sign_director` for a director field.
- **EHS Director notice:** when a form is first submitted with an EHS Director signature missing, every `forms.sign_director` holder who can see it is notified in-app and by email (1.0 notified Safety Directors). There is one notice per form and missing set.
- **Sign-in change:** the login page now honours `?next=` for a same-site path, so EHS Director links can return after sign-in. The sign-in hook also checks the origin.

## Print

- **Blank form** `/forms/templates/<id>/print` (`forms.export` or `forms.manage`):
  - It prints the latest version, or the draft (labelled) for `forms.manage`.
  - Write-in lines, boxes for choices, Yes / No / N/A boxes with a notes line, and signature / printed name / date lines.
- **Filled submission** `/forms/submissions/<id>/print` (`forms.export` plus view scope):
  - Header details, every visible answer, and Yes / No notes.
  - Signature images with signer, date and method, or "Awaiting supervisor / EHS Director".
  - Photo thumbnails.
- Letter-size print CSS hides the app around the sheet.

## Import from 1.0

**`/forms/import`** (`forms.manage`) takes a 1.0 forms JSON export of up to 20 MB.
- **Dry run** shows counts and problems; then **Import**.
- The upload goes to a route handler, `/forms/import/run`, because server actions here take only 1 MB. It accepts same-origin requests only.

**Accepted shapes** are the same as 1.0's catalog import:
- template and submission lists;
- a single form;
- Firebase freeze rows;
- exported `industrial_form_definitions` / `industrial_form_submissions` rows;
- nested `responses`.

**Mappings:**

| From 1.0 | To 2.0 |
| --- | --- |
| Form ACTIVE | active, published as version 1 |
| Form ARCHIVED | archived, published as version 1 (so its submissions have a version) |
| Form DRAFT | draft |
| Submission PENDING_SIGNATURE | pending_signature |
| Submission DRAFT | draft |
| Submission archived | archived |
| Any other submission status | submitted |

- **Fields:** 1.0 type names and aliases map to 2.0 types. "… Signature" labels become signature fields. Ids become 2.0 slugs, and answers are re-keyed to them.
- **Signatures** carry over with method `imported`.
- **The subject** is found by employee number.
- **Photos are not carried over.** 1.0 embedded them or linked to its own storage. Each one dropped is listed as a problem.
- **Re-import** uses the 1.0 id:
  - A form is updated only if nobody changed it in 2.0.
  - Submissions already imported are skipped.
  - Submissions whose form is missing are counted, not imported.

## Changes from 1.0

- **Added:**
  - Published versions that never change, with each submission pinned to its version (1.0 had a free-text version).
  - Concurrency protection.
  - Scope by location and division.
  - The permission-based EHS Director gate.
  - Sign links for EHS Directors that need sign-in.
- **Not ported:**
  - Offline filling in the field app (it waits for 2.0's field app).
  - Excel import (save as CSV).
  - The tenant-specific Producers MVR policy text and issuing-state shims.
  - The Creator console's generic JSON form editor (the builder replaces it).
  - Linking DQF checklist items to forms.
- **Not in 1.0 and still to do:** a CSV export of submissions, per-form reports, QR codes that open a form (slice 10, Scan), and removing photo files when a photo is taken off an answer.

## Code

| Area | Files |
| --- | --- |
| Rules and access | `src/lib/forgeFormRules.ts`, `src/lib/forgeFormAccess.ts` |
| Library and builder | `src/lib/forgeFormBuilderRules.ts`, `app/(back)/forms/page.tsx`, `forms/templates/**`, `forms/templateActions.ts`, `components/forms/FormBuilder*.tsx` |
| Filling and submissions | `src/lib/forgeFormSubmissions.ts`, `forms/fill/**`, `forms/submissions/**`, `forms/submissionActions.ts`, `components/forms/FormRenderer.tsx`, `FormSubmissionEditor.tsx` |
| Signing | `src/lib/forgeFormSigning.ts`, `forgeFormSignRequests.ts`, `forgeFormNotify.ts`, `forms/signingActions.ts`, `components/forms/FormSignaturePanel*.tsx`, `app/sign/[token]/`, `app/api/forms/sign/[token]/route.ts` |
| Print and import | `src/lib/forgeFormImport.ts`, `forgeFormImportRules.ts`, `forms/templates/[id]/print/`, `forms/submissions/[id]/print/`, `forms/import/**`, `components/forms/FormPrint*.tsx` |

## Tests

```bash
node --experimental-strip-types --test apps/web/tests/port-s9-*.test.cjs
node apps/web/tests/port-s9-form-signing-db.cjs
pnpm exec playwright test apps/web/tests/port-s9-*.spec.cjs --reporter=line --workers=1
```

- **Unit (31):** shared rules (11), builder text mode and CSV / checklist parsing (13), 1.0 import parsing (7).
- **DB (11 checks):** no direct access to submissions, sign requests or activity for anonymous callers and members; published versions can't be changed; token hashes must be sha256.
- **Browser (19 tests):**
  - Builder (5): build, publish, version 2 leaves version 1 unchanged, text mode, archive, duplicate, no builder without `forms.manage`.
  - Submissions (4): validation, draft, submit to Needs signature, filters, detail, forged supervisor signatures ignored, another user gets 404.
  - Signing (6): director gate, in-app EHS signature, anonymous supervisor link completing the form, link states, director link through login, send and revoke a link.
  - Print and import (4): blank and filled print, 404 for another user, 1.0 import with dry run, and a re-import that adds nothing.
