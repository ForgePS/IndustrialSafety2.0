# FIS-HD-01 — Forge Help Desk: Sprint Completion Checklist

Source brief: `Forge_Industrial_Safety_Help_Desk_Sprint.md` (sections 1–46).
Governing rules: `docs/FORGE_NEXT_LEVEL_FUNCTIONALITY_MASTER_DIRECTIVE.md`.

The Help Desk replaces the legacy `/support` desk and `/admin/creator/support` console. Legacy routes now redirect
to the new surfaces. The legacy attachment download URL returns a permanent redirect, and the legacy upload endpoint
returns `410 Gone`.

## Architecture

| Layer | Location |
| --- | --- |
| Schema, RLS, RPCs | `apps/web/supabase/migrations/20260924390000_forge_helpdesk_foundation.sql` (permissions, catalog, tickets, messages, attachments, tags, watchers, relations, saved replies, audit helper) |
| | `…391000_forge_helpdesk_sla_notifications.sql` (business calendars, SLA policies/instances/events, pause/resume, at-risk/breach evaluation, notification fan-out) |
| | `…392000_forge_helpdesk_ticket_rpcs.sql` (create, message, change, tags, watchers, link, merge, CSAT) |
| | `…393000_forge_helpdesk_knowledge_ai.sql` (knowledge workflow, search, Ask Forge sessions, AI suggestions) |
| | `…394000_forge_helpdesk_incidents_dev_analytics.sql` (platform incidents, status components, announcements, development issues, analytics) |
| Server layer | `apps/web/src/lib/forgeHelpdesk*.ts` (access, data, console data, attachments, knowledge, AI, development, HTTP helpers) and `forgeNotifications.ts` |
| Customer UI | `apps/web/src/app/(back)/help-desk/(customer)/…` — Help Center, articles, Ask Forge, My Tickets, new ticket, ticket detail, status, announcements |
| Staff console | `apps/web/src/app/(back)/help-desk/console/…` — dashboard/queues, ticket workspace, print, incidents, knowledge, development, analytics, tenants, settings |
| API routes | `apps/web/src/app/api/helpdesk/…` — ticket attachment upload, attachment download, knowledge media, status feed, ticket/analytics export, scheduled job (`cron`) |

The design follows the master directive:
- **Writes and permissions.** Every write goes through a `security definer` RPC that re-checks Forge staff permissions (`forge_support_staff_has_permission`) or tenant membership. The browser never supplies an organization ID that is trusted.
- **Table access.** Help desk tables have RLS enabled, and `anon`/`authenticated` access is revoked.
- **Concurrency and retries.** Optimistic locking uses `row_version`. Ticket creation is idempotent through a client idempotency key.
- **Audit.** Every audit row goes to the append-only `forge_creator_audit_log`.
- **No physical deletes.** Merge closes the duplicate, articles are archived, and relations are archived.

## Permissions

- **Tenant (customer) permissions**, granted through the existing tenant role templates: `helpdesk.ticket.create`, `.view_own`, `.view_location`, `.view_tenant`, `.comment`, `.reopen`, `.close`, `helpdesk.knowledge.view` and `helpdesk.status.view`.
- **Forge platform permissions**, granted through `forge_support_platform_role_permissions`:
  - Support: `helpdesk.support.view`, `.assign`, `.respond`, `.internal_note`, `.change_priority`, `.change_status`, `.merge`, `.escalate`, `.link_incident`, `.link_development` and `.manage_watchers`.
  - Administration: `helpdesk.admin.manage`, `.sla`, `.categories`, `.templates`, `.tags`, `.status`, `.announcements` and `.incidents`.
  - Knowledge: `helpdesk.knowledge.create`, `.edit`, `.review`, `.publish` and `.archive`.
  - Analytics: `helpdesk.analytics.view` and `.export`.
- **Role mapping.**
  - `forge_owner` and `forge_creator` hold every permission.
  - `forge_support` agents can work tickets, draft and review knowledge, and view analytics. They **cannot** publish knowledge or declare platform incidents.
  - Tenant admins have no staff permissions.

## Seed data (fictional only)

The seed creates the fictional tenant Northstar Manufacturing (Plant 2), with three accounts: a Northstar company administrator, a Northstar employee, and the Forge support agent Riley Morgan (`support@forge2.local`). All passwords are `ForgeDev2!`.

Demo tickets are created through the production RPCs, so numbering, SLA, history, notifications and audit come from real code paths. The seed also includes:
- one breached P1 ticket;
- knowledge articles: public, tenant-only, Forge-internal and draft;
- a platform incident;
- service-status components;
- announcements;
- a development issue.

## How to run the gates

```powershell
cd apps/web; supabase db reset; cd ../..                       # clean migrate + seed
node scripts/check-forge-ai-schemas.cjs                         # AI capability schemas
pnpm --filter forge-industrial-safety-2.0-web type-check
pnpm --filter forge-industrial-safety-2.0-web build
node apps/web/tests/setup-support-smoke.mjs                     # second-tenant fixture
node apps/web/tests/fis-hd01-helpdesk-db.cjs                    # DB regression (72 checks)
# with the dev server on 127.0.0.1:3000 and SMOKE_BASE_URL set:
pnpm exec playwright test apps/web/tests/support-smoke.spec.cjs --workers=1
pnpm exec playwright test apps/web/tests/fis-hd-helpdesk.spec.cjs --workers=1
pnpm exec playwright test apps/web/tests/fis-hd-mobile.spec.cjs --workers=1
```

CI: `.github/workflows/customer-support-validation.yml` runs the DB regression, the support smoke test, and the help desk browser and mobile suites.

## Gate results (local, Windows, clean database)

| Gate | Result |
| --- | --- |
| `supabase db reset` (all migrations + seed) | PASS |
| AI schema check | PASS (24 schemas) |
| Type-check | PASS |
| Production build | PASS |
| Lint — help desk files | PASS (clean) |
| Lint — whole repo | FAIL — failures predate this sprint in unrelated files; CI does not run lint |
| DB regression `fis-hd01-helpdesk-db.cjs` | PASS 72/72 |
| Browser `support-smoke.spec.cjs` | PASS |
| Browser `fis-hd-helpdesk.spec.cjs` | PASS 6/6 |
| Browser `fis-hd-mobile.spec.cjs` (390×844) | PASS 2/2 |
| Corrective-actions and incident-equipment smoke (regression) | PASS |
| GitHub Actions run of the updated workflow | Not run yet (requires push) |

## Testing requirements (brief §40) → coverage

- **Security.** Covered by the DB regression (isolation and permission sections) and the `tenant isolation…` browser test:
  - tenant A cannot read tenant B's tickets or download its attachments;
  - customers cannot read internal notes or use console/export routes;
  - permission checks are enforced server-side;
  - the scheduled job route rejects requests that lack the secret.
- **Ticket lifecycle.** Create, assign, change status, change priority, reply, internal note, resolve, reopen and close (staff and customer). Covered by the DB regression `lifecycle` and `triage` sections and browser tests 1–3.
- **Attachments.** Allowed file, rejected `.exe`, cross-site upload refused, cross-tenant upload 404, internal attachment hidden from the customer. Covered by browser tests 1–3 and 6.
- **SLA.** Target creation, pause on waiting-on-customer, resume, at-risk detection, breach detection, completion on resolve. Covered by DB regression `lifecycle`, `slaAtRisk` and `slaBreach`.
- **Knowledge base.** Draft → review → publish (the agent cannot publish), tenant-private visibility, internal and draft articles hidden from customers. Covered by DB regression `knowledge` and browser test 4.
- **Platform incident.** Create (permission-gated, INC numbering), link tickets, publish update, resolve with customer notification, linked tickets never auto-closed, bulk action only on resolve. Covered by DB regression `incidents`.
- **Numbering.** 12 concurrent creates produce unique `SUP-YYYY-######` numbers; idempotent replay returns the original ticket. Covered by DB regression `numbering`.

## Acceptance criteria (brief §44)

- [x] Ticket creation works with persistence
- [x] Unique ticket numbering works
- [x] Customer can see authorized tickets only (own / location / company scope)
- [x] Cross-tenant access is blocked
- [x] Customer replies work
- [x] Internal notes work and are private
- [x] Attachments work securely (private storage, MIME/size allow-list, same-origin upload, authorization on download)
- [x] Ticket assignment works
- [x] Status workflow works (transition table, resolution summary required)
- [x] Priority workflow works (history, SLA re-target)
- [x] Tags work (global and tenant-scoped)
- [x] Watchers work (staff and same-company users only)
- [x] Related tickets work (same tenant; duplicates only via merge)
- [x] Duplicate handling works (merge keeps data, closes the duplicate, requester follows the canonical ticket)
- [x] SLA rules work (business or calendar hours, pause on waiting-on-customer)
- [x] SLA risk/breach detection works
- [x] Notifications work (in-app delivery; email outbox delivered by the scheduled job when Resend is configured)
- [x] Knowledge base works
- [x] Knowledge search works
- [x] Ask Forge support flow works (answers grounded in knowledge articles, escalates into a pre-filled ticket)
- [x] Platform incident management works
- [x] Service status works
- [x] Announcements work
- [x] Development issue linking works (internal issue records; GitHub push when configured)
- [x] CSAT works (1–5, requester only, once, immutable)
- [x] Analytics work
- [x] Audit trail works (append-only)
- [x] Responsive/mobile UX works (verified at 390×844 for customer and console surfaces)
- [x] Automated security tests pass
- [x] Automated lifecycle tests pass
- [x] No placeholder buttons
- [x] No dead links (legacy routes redirect)
- [x] No fake success responses
- [x] No TODO-only implementation presented as complete
- [x] No real production/customer data used in seed data

## Operational configuration (production)

| Variable | Purpose | Without it |
| --- | --- | --- |
| `HELPDESK_CRON_SECRET` (≥ 24 chars) | Bearer secret for `GET/POST /api/helpdesk/cron`. Run it every 1–5 minutes from the deployment scheduler. | SLA evaluation runs lazily on console loads (at most once per minute per server), and email deliveries stay `pending`. |
| `RESEND_API_KEY`, `FORGE_NOTIFICATIONS_EMAIL_FROM` | Email channel for notifications | In-app notifications only. |
| `OPENAI_API_KEY`, `FORGE_HELPDESK_AI_MODEL` | Generative answers/suggestions when settings use `auto` mode | The extractive knowledge-base provider is used. AI output is never auto-sent. |
| `FORGE_HELPDESK_GITHUB_TOKEN`, `FORGE_HELPDESK_GITHUB_REPO` (`owner/repo`) | Push development issues to GitHub | Development issues stay internal records; the only push option offered is "Keep in Forge only". |

## Known limitations

- **No scheduler in the repo.** Production must configure one to call `/api/helpdesk/cron` (Vercel git deployments are disabled in `vercel.json`).
- **Repo-wide lint debt.** `pnpm lint` still fails on files that predate this sprint (for example `forgeResourceRegistry.ts` and `forgeAiTools.ts`). Every help desk file passes lint.
- **CI not run remotely.** The workflow changes have been validated locally only, not yet on GitHub Actions (Linux, frozen lockfile).
- **AI is not in the shared capability registry.** Help desk AI reuses the shared provider (`forgeAiProvider`) and produces text-only drafts stored in `forge_support_ai_suggestions`. A staff member must accept, edit or reject each draft (recorded once, with the original preserved) and then send it through the normal reply RPC. It performs no mutations, so it is not registered in the generic Forge AI capability registry or approved-action queue.
