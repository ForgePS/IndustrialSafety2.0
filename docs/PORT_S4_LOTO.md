# Port slice 4: Lockout / Tagout (Industrial 1.0 → 2.0)

2.0 already had LOTO procedures with revisions, frozen snapshots and periodic reviews. That procedure lifecycle was stronger than 1.0's. What 2.0 lacked was everything that happens at the machine. This slice adds:

- equipment and isolation-point photos, with red arrows drawn on them
- 1.0's procedure content: precautions, purpose / scope / enforcement, shutdown and restore sequences, restoration checks
- return for correction during review
- real lockouts: lock holders, group lockout, step checklist, zero-energy and try-start verification, return to service, cancel
- authorized-employee training enforcement (OSHA 1910.147(c)(7))
- the two-page printable sheet with a QR code, single or batch
- the public "View LOTO procedures" QR page
- editing and reordering energy sources and steps
- CAPA from a lockout, and LOTO on the asset page

It builds on slice 0 (personnel) and slice 3 (training completions, used for authorization).

1.0 reference (under `legacy/forge-platform`):
- `apps/industrial-web/src/lib/loto.ts`, `loto-image-annotations.ts`
- `apps/industrial-web/src/components/loto-*`
- `apps/platform-api/src/modules/industrial/loto*.ts`, including `loto-print.ts`
- the LOTO section of `schema/industrial.ts`

## Data model

Migration: `apps/web/supabase/migrations/20261115170000_forge_loto_parity.sql`.

| Table / column | Purpose |
| --- | --- |
| `forge_loto_procedures` (new columns) | `precautions` (array of `{key, category, text}`), `print_purpose`, `print_scope`, `print_enforcement`, `shutdown_sequence`, `restore_sequence`, `restoration_checks`. Empty fields fall back to 1.0's standard text when shown or printed. |
| `forge_loto_energy_sources.energy_code` | The tag code printed on the isolation point (e.g. `E1`). Its letter picks the 1.0 colour. |
| `forge_loto_photos` | Photos for the equipment (no energy source) or one isolation point. JPEG, PNG or WebP, up to 10 MB, 6 per slot. `annotations` holds the arrows in 0–1 coordinates. A trigger allows changes only while the procedure is Draft or Under Review. Files live in the private `forge-loto` bucket. Removing a photo keeps the file so older snapshots still resolve. |
| `forge_loto_review_returns` | Each "return for correction": notes, who and when. |
| `forge_loto_settings` | Per organization: the authorized-employee course, and whether lockouts require it. |
| `forge_loto_applications` (reworked) | A lockout. `lockout_number` (`LKO-000001`), work description, affected employees, try-start flag, step checks, verification, restoration checks done, cancel reason, and `procedure_snapshot` (frozen at issue). Status: `in_progress` (Issued), `verified`, `completed` (Returned to Service), `canceled`. At most one open lockout per procedure. |
| `forge_loto_application_locks` | One row per lock holder: personnel (optional), name, lock/tag ID, applied and removed by/at, removal note. |

Database functions (service role only). Each locks its row and raises `23514` on a rule break:

| Function | Rule |
| --- | --- |
| `forge_loto_issue_lockout` | Procedure approved with steps and no open lockout. Work described. Affected employees notified. At least one holder, each with a name and, when required, current training. |
| `forge_loto_check_step` | Only while Issued. The step must be in the snapshot. |
| `forge_loto_add_lock` | Only on an open lockout. Same holder rule. |
| `forge_loto_remove_lock` | A note is required unless the person removing it is the holder (1910.147(e)(3)). |
| `forge_loto_verify_lockout` | Every step checked, at least one lock on, zero energy confirmed, try-start done if required. |
| `forge_loto_complete_lockout` | Verified, every lock off, every restoration check ticked. |
| `forge_loto_cancel_lockout` | Open, a reason given, every lock off. |
| `forge_loto_return_for_correction` | Under Review to Draft. Notes required. |
| `forge_resolve_qr_token` | Read-only token lookup for the public page. |

Access: RLS is on and `anon` / `authenticated` are revoked on all 11 LOTO tables. The old member `SELECT` policies were dropped, so the app reads through the service role after permission and scope checks. New permission: `loto.settings` (safety manager, company admin, company owner).

QR: a new `loto_view` default action. `/q/<token>` sends it to `/q/<token>/loto`. The scan log records `/q/<number>/loto`, not the token.

## Changes from 1.0

- 1.0 lockouts were one record per person. 2.0 runs one lockout per job with any number of locks (group lockout). The equipment cannot return to service until every lock is off.
- The lockout works from the snapshot taken when it was issued, so a revision made mid-job does not change the steps people are following.
- Removing someone else's lock needs a recorded reason. 1.0 did not enforce this.
- Training enforcement is optional per organization. When on, typed names are refused and holders must be personnel with a current, approved completion of the chosen course.
- Printing creates the asset's LOTO QR code only for people allowed to create QR codes (`qr_management.create`). Others get the sheet without a QR until someone with permission prints it.
- The sheet is a generic two-page layout. The Producers-specific background PNG and its "Mill Operator/Scale" wording were not carried over.
- Photo uploads are checked by magic bytes, not just the declared type.

## UI

| Page | What it does |
| --- | --- |
| `/loto` | Procedures list with Procedures / Lockouts / Settings tabs, a "Locked out" badge, and checkboxes to print up to 100 procedures at once. |
| `/loto/[id]` | Procedure: photos with the arrow editor (camera, file, paste or drag-drop), energy source and step cards (edit, reorder, delete), content form, lifecycle (submit, approve, return for correction, revise, issue lockout, print, retire), correction banner, and lockout, review, return and revision history. |
| `/loto/lockouts` | Open lockouts, or history (`?view=history`). |
| `/loto/lockouts/[id]` | Runs a lockout: stage bar, work and precautions, locks (add, remove with note), isolation points, step checklist, verify, return to service, cancel, and create a corrective action. |
| `/loto/settings` | Authorized-employee course and enforcement. |
| `/loto-print?ids=a,b` | Printable sheets, two letter pages per procedure. |
| `/q/[token]/loto` | Public, read-only: approved procedures for the asset with photos and arrows, no names or history. |
| `/assets/[id]` | New Lockout / Tagout card listing the asset's procedures, with a print link. |

Shared code:
- `src/lib/forgeLotoRules.ts`: pure rules, defaults, energy colours and arrows.
- `src/lib/forgeLotoServer.ts`: server helpers.
- `src/components/loto/`: `LotoAnnotatedImage`, `LotoEnergyBadge`.

## Still not done

- **LOTO reports.** The 1.0 reports catalog entries for LOTO (procedures due for review, lockout history) are not in 2.0's report builder yet.
- **Forge AI context for lockouts.** Forge AI knows procedures (from the earlier LOTO AI migration) but not lockouts.
- **Sanitation links.** 1.0 linked sanitation tasks to LOTO procedures. That waits for the sanitation port.
- **Brady label export.** 1.0 could export isolation-point tags for Brady printers. Not ported.
- **Automatic review reminders.** Overdue reviews are flagged on screen. No scheduled notice yet; same scheduler gap as slice 3.

## Tests

```bash
node --experimental-strip-types --test apps/web/tests/port-s4-loto-rules.test.cjs
node apps/web/tests/port-s4-loto-db.cjs
pnpm exec playwright test apps/web/tests/port-s4-loto.spec.cjs --reporter=line --workers=1
```

- **Unit tests (11):** energy letters and badges, precaution, sequence and restoration-check cleaning, default content, arrow clamping and heads, lockout blockers, open status and overdue reviews.
- **DB contract (46 checks):**
  - return for correction
  - the photo guard: 6 per slot, energy source in the same procedure, image types, frozen once approved
  - every issue, verify, complete and cancel rule
  - group locks and the removal note
  - removing your own lock without a note
  - training enforcement, including expired training
  - signed-in members cannot read LOTO tables or call the functions
- **Browser (2 tests):**
  - return for correction, resubmit and approve
  - the printed sheet with its QR code
  - issue a lockout, check steps, verify, remove the lock with a note, return to service
  - the QR scan redirect and the public page, without signing in, showing no holder names

Local note: Playwright is no longer in the repo's `node_modules`. Install `@playwright/test@1.55.0` anywhere and point `NODE_PATH` at it, or add it back as a dev dependency. When the dev server is not on `NEXT_PUBLIC_APP_URL`'s port, run with `SMOKE_BASE_URL`.
