# FIS-HD-01 Help Desk - Sprint Completion Checklist

Source spec: `Forge_Industrial_Safety_Help_Desk_Sprint.md` (phases HD-01 through HD-10).
Delivery plan: phases 1-3 ship together, then one phase at a time.

Legend: `[x]` done and connected to real persistence, `[ ]` not started or incomplete.

## Where things live

| Area                                                       | Location                                                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Contracts (statuses, priorities, transitions, permissions) | `packages/contracts/src/helpdesk.ts`                                                                     |
| Schema                                                     | `packages/database/src/schema/helpdesk.ts`                                                               |
| Migration (tables, RLS, permissions, starter content)      | `packages/database/drizzle/0108_helpdesk_foundation_s1.sql`                                              |
| API module                                                 | `apps/platform-api/src/modules/helpdesk/` (`/api/v1/helpdesk/...`)                                       |
| Customer Help Center                                       | `apps/industrial-web/src/app/help-desk/` and `components/helpdesk/help-center-workspace.tsx`             |
| Support Console                                            | `apps/industrial-web/src/app/help-desk/support/` and `components/helpdesk/support-console-workspace.tsx` |
| Demo seed (local/dev only)                                 | `scripts/seed-helpdesk-demo.mjs`                                                                         |

## HD-01 - Foundation

- [x] Schema: tickets, messages, attachments, events, tags, ticket tags, watchers, categories, yearly sequence
- [x] Ticket numbers `SUP-YYYY-######` from an atomic upsert counter (25 concurrent claims verified distinct)
- [x] Tenant isolation with forced RLS on every ticket table (integration tests as `forge_app`)
- [x] Permissions seeded; customer permissions granted to existing roles and role templates; `view_tenant` to Industrial admins; support permissions not granted to customers
- [x] Audit events on create, reply, status, priority, assignment, tags, watchers, attachments
- [x] Status lifecycle with separate customer and support transition rules
- [x] Optimistic concurrency (`recordVersion`) on status and priority changes
- [x] Idempotent ticket creation (`clientRequestId`)
- [x] Starter content in production: request types, Industrial product areas, global tags

## HD-02 - Customer Portal

- [x] Help Center landing with "Need help?" search across the user's tickets and "start a ticket about ..." shortcut
- [x] Guided Submit a Ticket form (request type, area, subject, description, reported severity)
- [x] Technical details auto-capture with opt-out and preview; server-side allowlist strips URLs/secrets
- [x] Attachments (files and phone camera) via presigned S3 upload; type and 25 MB size checks on client and server
- [x] My Tickets: open / resolved-closed / all, search, mine vs company scope (company requires `view_tenant`)
- [x] Ticket detail: conversation timeline, reply with attachments, reopen, close
- [x] Customers never receive internal notes, internal attachments, internal events, assignee identity, disposition, or technical context
- [x] Mobile-first layout (stacked panels, camera capture button, list rows instead of wide tables)
- [x] Notifications link back to `/help-desk/?ticket=...`

## HD-03 - Support Console

- [x] Scorecards: open, critical, high, unassigned, assigned to me, waiting on customer, waiting on Forge, new today, resolved today (live counts)
- [x] Queues: open, mine, unassigned, critical, high, waiting on customer/Forge, feature requests, bugs, known issues, closed, everything
- [x] Filters: search (number, subject, requester, customer name, tag, full text), priority, status, request type, area, assignee, tag, sort
- [x] Ticket table: number, customer, subject, product/area, priority, status, assigned, created, age
- [x] Three-panel workspace: customer and technical context, conversation, controls
- [x] Composer with distinct Reply-to-customer (blue) vs Internal note (yellow) modes and confirmation when switching with a draft
- [x] Reply and set status in one step
- [x] Status + disposition + internal change note
- [x] Priority, assignee with "Assign to me", tags (create and remove), watchers
- [x] Internal attachments hidden from customers
- [x] Platform admins see all tenants; non-platform support agents limited to their own tenant
- [ ] SLA at-risk and breached scorecards (HD-04)
- [ ] Saved replies (HD-10 admin; spec section 14)
- [ ] Related tickets, merge, duplicate detection (spec sections 13 and 21)

## HD-04 - SLA and Notifications

- [ ] SLA policies and per-ticket SLA instances
- [ ] At-risk and breach detection, pause while waiting on customer
- [ ] Notification event system with email adapter interface (in-app notifications already sent for replies, status, assignment)

## HD-05 - Knowledge Base

- [ ] Categories, articles, draft / review / publish, search, feedback, visibility, KB admin

## HD-06 - Ask Forge Support

- [ ] Support entry point, KB retrieval, suggested answer, solved / not solved, ticket with AI context

## HD-07 - Platform Incidents

- [ ] Incidents, component status, updates, linked tickets, affected tenants, service status page, announcements

## HD-08 - Development Integration

- [ ] Development issue abstraction, ticket links, fix version, private engineering details

## HD-09 - Analytics

- [ ] MTTA, MTTR, SLA compliance, volume, top categories, tenant trends, CSAT, reopen rate

## HD-10 - Forge Admin Support Center

- [ ] Tenant lookup, SLA settings, category and tag admin, saved replies, announcements, support configuration

## Verification log

| Date       | Check                                                                                            | Result   |
| ---------- | ------------------------------------------------------------------------------------------------ | -------- |
| 2026-10-08 | `platform-api` typecheck                                                                         | Pass     |
| 2026-10-08 | Help Desk API unit tests (rules, access matrix)                                                  | 24 pass  |
| 2026-10-08 | Help Desk RLS integration tests (isolation, internal-note constraint, concurrent numbering)      | 4 pass   |
| 2026-10-08 | Migration 0108 on a clean test database                                                          | Pass     |
| 2026-10-08 | `industrial-web` typecheck and lint on Help Desk files                                           | Pass     |
| 2026-10-08 | Demo seed applied twice (idempotent replace) on test database                                    | Pass     |
| 2026-10-08 | `industrial-web` production build (`/help-desk`, `/help-desk/support`)                           | Pass     |
| 2026-10-08 | Production: migration 0108 applied, API task definition revision 466, web synced and invalidated | Deployed |
