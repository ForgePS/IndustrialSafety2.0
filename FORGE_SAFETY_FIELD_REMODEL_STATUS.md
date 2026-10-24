# Forge Safety - Field Version — Remodel Status

**Application:** Forge Safety - Field Version  
**Updated:** 2026-09-11  
**Terminology lock:** Location = `site_id`; Division = `division_name`; keep DB columns.

---

## Phase tracker

| Phase  | Status                    | Scope                                                                                     |
| ------ | ------------------------- | ----------------------------------------------------------------------------------------- |
| **0**  | **COMPLETE**              | Audit                                                                                     |
| **1**  | **COMPLETE**              | Foundation shell / nav / org / permissions                                                |
| **2**  | **COMPLETE**              | Home and My Work                                                                          |
| **3**  | **COMPLETE** (2026-09-10) | QR scanner, manual entry, resolver routing, Location/Division/Form/Supply/Equipment paths |
| **4**  | **COMPLETE** (2026-09-10) | Field form engine                                                                         |
| **5**  | **COMPLETE** (2026-09-10) | Inspections depth                                                                         |
| **6**  | **COMPLETE** (2026-09-10) | Reporting                                                                                 |
| **7**  | **COMPLETE** (2026-09-10) | Safety workflows                                                                          |
| **8**  | **COMPLETE** (2026-09-10) | Operations                                                                                |
| **9**  | **COMPLETE** (2026-09-11) | Emergency                                                                                 |
| **10** | **COMPLETE** (2026-09-11) | Offline engine                                                                            |
| **11** | **COMPLETE** (2026-09-11) | Calendar, Reminders, My Forge                                                             |
| **12** | **COMPLETE** (2026-09-11) | Hardening                                                                                 |

---

## Phase 12 notes

- Permission audit unit coverage across all `FIELD_PERMISSIONS`; Location/Division filter + offline scope tests
- Accessibility: lint green (label associations, no autofocus, media caption policy); `:focus-visible`; skip link
- Production errors: `FieldErrorBoundary` in shell; reload preserves offline queue
- Notifications: Alerts lists `my-notifications` with industrial→Field deep-link mapping (calendar/reminders/tasks/corrective/sanitation)
- PWA: shell SW `v13` + update banner that keeps pending offline items; network-first HTML unchanged
- Security headers remain at CDN/host (static export); Dexie / push completed in post-12 follow-up
- Follow-up: emergency acknowledgment API + Field Acknowledge button (post Phase 12)
- Lint green; unit tests: 122 passing; typecheck clean

---

## Follow-up — Dexie, Push, CDN (2026-09-11)

- Dexie IndexedDB store for offline queue/cache with localStorage migration; shell awaits `ensureOfflineStore`
- Web Push: `user_push_subscriptions` migration `0094`, `/api/v1/industrial/push/*`, SW push handlers, Me toggle (requires `WEB_PUSH_VAPID_*` env)
- CDN: Field Permissions-Policy includes `notifications=(self)`; CloudFront adds COOP/CORP; redeploy `ForgeFieldFrontend` for header changes
- Field-web: 122 tests, lint, typecheck clean; notifications unit tests green

---

## Phase 11 notes

- Calendar hub `/calendar/`: Agenda (default), 3 Day, Week, Month; Location (`site_id`) client filter; create event with org Location
- Reminders hub `/reminders/`: Today / Upcoming / Overdue / Sent / All; snooze, dismiss, open related task/event
- My Forge `/my-forge/`: personal hub linking Profile, Training, Certs, Tasks, Inspections, Observations, Equipment, Acknowledgments, Schedule, Reminders, Notifications, Settings + Division/Location prefs
- Me Tools cards: Calendar, Reminders, My Forge; modules `CALENDAR` / `REMINDERS`
- API: calendar + reminders accept `field.access` (reuse industrial endpoints; no new Nest controllers)
- Unit tests: 113 passing; typecheck clean

---

## Phase 10 notes

- Shared offline engine under `lib/offline/`: classification, bounded cache, mutation queue, conflict policy, sync flush
- Sanitation outbox migrated into unified queue (legacy key auto-migrates); shell banner shows real pending count and flushes on reconnect
- Emergency procedures / plant number / active alerts cached for offline read
- Forms definitions cached; form submissions + observation/hazard/equipment reports queue when offline (incidents stay online-only)
- Dexie/IndexedDB delivered in post-12 follow-up; SW remains shell + push handlers
- Unit tests: 107 passing; typecheck clean

---

## Phase 9 notes

- Emergency hub `/more/emergency/`: plant number, procedure tabs (EAP / evacuation / weather / fire / chemical / contacts / drills), Location scoping
- Active emergency alerts listed on hub and Alerts tab; detail view with Acknowledge when required
- Module gate: EMERGENCY_ALERTS or EMERGENCY_RESPONSE; permission `field.emergency.view`
- API: Field can list emergency-response categories + emergency-alerts (view/settings); `POST .../acknowledge` records employee ack
- Offline procedure cache delivered in Phase 10; notification inbox delivered in Phase 12
- Unit tests: 95 passing; typecheck clean

---

## Phase 8 notes

- Equipment browser `/more/equipment/` with Location (`site_id`) filter + profile load on `/equipment/[id]/`
- Fleet `/fleet/`, Forklifts `/forklifts/`, DOT `/dot/` hubs; DVIR runner `/dvir/[vehicleId]/` via `POST /dot`
- Safety Supplies issue (signature) + request with org/scan context
- Forms Me card + Location scoping (Phase 4 runner unchanged)
- Me Tools: Equipment, Fleet, Forklifts, DOT / DVIR, Safety Supplies, Forms
- API: `GET equipment/:id`, `siteId` on equipment/fleet lists, Field perms on fleet/supplies/dot
- Unit tests: 88 passing; typecheck clean

---

## Phase 7 notes

- Safety workflows hub `/workflows/` lists only enabled modules
- JSA list + acknowledgment (signature) on `/jsa/` and `/jsa/[id]/`
- Permits hub: Hot Work / Confined Space / Heights / Electrical (tabs per enabled module); confined atmospheric readings
- SDS chemical search + critical fields; Food Safety entry preserves name via Sanitation `?focus=food`
- LOTO + Sanitation unchanged baselines; Me Tools cards gated by module enablement
- API: Field can list/get/act on jsas, permits, chemical-safety
- Unit tests: 81 passing; typecheck clean

---

## Phase 6 notes

- Report hub: Incident, Near Miss, Observation, Hazard, Equipment Issue, Security
- Guided mobile runner with Division/Location/Department, photos, drafts, anonymous option
- Injury path captures operational OSHA handoff fields (body areas, work day) — forms stay on desktop
- Equipment issues create corrective actions; Scan/Equipment hubs route to `/report/equipment/`
- API: Field roles can create incidents/observations/corrective actions
- Unit tests: 76 passing; typecheck clean

---

## Phase 5 notes

- Inspections hub `/inspections/`: Assigned / Due Today / Upcoming / Overdue / Completed with Location/Division filtering
- Runner: template picker, critical findings, inspector signature, photo attach API + inline drafts, org context on create
- Complete returns `assetOutOfService` / reason; success screen deep-links corrective actions
- My Work Inspections tab loads live inspections (not CTA-only)
- Unit tests: 71 passing; typecheck clean

---

## Phase 4 notes

- Mobile form renderer: schema extract, conditional `visibleWhen`, validation, Yes/No notes
- Autosave: localStorage drafts + server `DRAFT` create/patch; Submit → `SUBMITTED`
- Field types: text/textarea/number/date/select/checkbox/radio/yesno/signature/photo + Location/Division/Department
- Signature pad (typed or draw); camera/file photo attach with compression
- `/forms/` lists definitions; `/forms/[formId]/` runs engine; Form QR already routes here
- API: Field roles can submit via expanded `FORM_SUBMIT` permissions
- Unit tests: 68 passing; typecheck clean

---

## Phase 3 notes

- Scanner: flashlight, camera selector, permission-denied + manual entry, `/q/` + FGE token parse
- Resolver hub: clearer failure messages; sets org context for Location/Division/Department QR
- Routes: Equipment/Vehicle/Forklift, Location/Division/Department, Form/Document, Training, Safety Supplies, SDS, Permits, Emergency
- Location hub actions + Safety Supplies scan context query params
- Forms routes stubbed pending Phase 4 renderer
- Unit tests: 57 passing; typecheck clean

---

## Doc index

- Audit: [FORGE_SAFETY_FIELD_AUDIT.md](./FORGE_SAFETY_FIELD_AUDIT.md)
- Changelog: [FORGE_SAFETY_FIELD_CHANGELOG.md](./FORGE_SAFETY_FIELD_CHANGELOG.md)
