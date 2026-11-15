# Forge Safety - Field Version — Changelog

**Application:** Forge Safety - Field Version

---

## 2026-09-11 — Dexie, Web Push, CDN headers

- Dexie-backed offline CacheStore with localStorage migration; SW remains shell + push handlers.
- Web Push subscribe/unsubscribe APIs + Me toggle; VAPID via `WEB_PUSH_VAPID_*` env / Secrets Manager.
- CloudFront: COOP/CORP headers; Field Permissions-Policy allows notifications (redeploy FieldFrontend).

## 2026-09-11 — Post Phase 12 (Emergency acknowledgment)

- Field can Acknowledge active emergency alerts that require it; server records timestamp (idempotent).
- `POST /api/v1/industrial/emergency-alerts/:id/acknowledge` available to Field viewers.

## 2026-09-11 — Phase 12 (Hardening)

- Lint/a11y green; focus-visible + skip link; shell error boundary.
- Alerts notification list with Field deep links; PWA update banner preserves offline queue.
- Permission audit + Location/Division/offline isolation tests; SW shell cache v13.

## 2026-09-11 — Phase 11 (Calendar, Reminders, My Forge)

- Calendar agenda/short-range views with Location filter and event create.
- Reminders list with snooze / dismiss / open related; task-linked create.
- My Forge personal hub over existing Field routes; Me Tools cards for Calendar, Reminders, My Forge.
- Field `field.access` allowed on industrial calendar and reminders APIs.

## 2026-09-11 — Phase 10 (Offline engine)

- Shared offline engine: domain classification, tenant-scoped cache, mutation queue, conflict policy, sync flush.
- Sanitation outbox folded into the unified queue; shell banner pending count + auto-flush on reconnect.
- Emergency read-cache; form submissions and observation/hazard/equipment reports queue offline (incidents remain online-only).

## 2026-09-11 — Phase 9 (Emergency)

- Emergency hub with plant number, procedure categories, and Location-scoped lists.
- Active emergency alerts on Emergency hub and Alerts tab (view-only; ack later).
- Field permissions for emergency-response + emergency-alerts APIs; Me Tools gated by module + `field.emergency.view`.

## 2026-09-10 — Phase 8 (Operations)

- Equipment, Fleet, Forklifts, and DOT / DVIR hubs with Location (`site_id`) context.
- Equipment profiles load live records; DVIR runner submits authenticated DOT records.
- Safety Supplies issue (recipient signature) and request flows; Forms Me card with Location scoping.
- API: equipment get + site filters; Field permissions on fleet, supplies, and DOT create.

## 2026-09-10 — Phase 7 (Safety workflows)

- Workflows hub shows only enabled modules (JSA, LOTO, permits, chemicals, Food Safety, Sanitation).
- JSA acknowledge with signature; permits hub with type tabs + confined atmospheric readings; SDS critical summaries.
- Food Safety preserved as named entry into Sanitation; Me Tools cards expanded and module-gated.

## 2026-09-10 — Phase 6 (Reporting)

- Mobile report runner for incident, near miss, observation, hazard, equipment issue, and security.
- Division/Location/Department assignment, photo evidence, local drafts, anonymous observation/near-miss option.
- Injury reports collect operational OSHA handoff data; equipment issues create corrective actions.
- Field create permissions expanded for incidents, observations, and corrective actions.

## 2026-09-10 — Phase 5 (Inspections depth)

- Inspections hub with status tabs and Location/Division filtering.
- Runner depth: template picker, signature, critical findings, photo attachments, CA deep-links, OOS feedback.
- My Work Inspections tab wired to live inspection list; Start/Continue flows.
- API complete response includes out-of-service flags.

## 2026-09-10 — Phase 4 (Field form engine)

- Reusable mobile form runner with autosave, drafts, conditional sections, and validation.
- Signature pad, camera/photo attachments, Location/Division/Department fields from org context.
- Forms list + `/forms/[formId]/` fill path; submit permissions expanded for Field roles.
- Unit tests: 68 passing; typecheck clean.

## 2026-09-10 — Phase 3 (QR system)

- Scanner upgrades: flashlight, multi-camera select, permission-denied guidance, clearer manual entry.
- Token parse supports `/q/{code}`, FGE-style codes, and existing `/scan/{token}` URLs.
- Scan hub maps Equipment/Location/Division/Department/Form/Training/Safety Supply (+ SDS/Permit/Emergency) to Field routes.
- Location QR applies org context and shows Location actions; Safety Supplies accepts scanned target query params.
- Added `/forms/` routes (resolve now; renderer in Phase 4).
- QR failure messaging for 401/403/404/tenant mismatches.
- Unit tests: 57 passing; typecheck clean.

## 2026-09-10 — Phase 2 (Home and My Work)

- Home status cards, quick actions, Today list; My Work kind/due filters; task & corrective detail on real APIs.
- my-work API enriched with Location/Division fields.

## 2026-09-10 — Phase 1 (foundation)

- Brand, nav Home|My Work|Scan|Alerts|Me, tablet rail, org/permission/module providers.

## 2026-09-10 — Phase 0

- Audit, remodel status, and changelog docs created.
