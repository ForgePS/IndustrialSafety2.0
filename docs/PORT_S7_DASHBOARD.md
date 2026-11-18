# Port slice 7: Home dashboard (Industrial 1.0 → 2.0)

2.0's dashboard was a grid of module cards. This slice brings over 1.0's home dashboard: what needs attention across every module, tasks, the safety index, trends, the injury body map and a workspace, laid out the way each user chooses.

1.0 reference (under `legacy/forge-platform/apps/industrial-web/src`):
- `components/industrial-dashboard.tsx`
- `lib/dashboard-layout.ts`, `lib/dashboard-quick-links.ts`, `lib/dashboard-insights.ts`
- `components/incident-body-map*`
- API: `industrial-domain.service.ts` `dashboard()`, `computeSafetyIndex`, `safetyGrade`

## Blocks

Every block reads its data through the module's own scoped loader with the viewer's view permission. A block the viewer has no permission for is not shown. A source that fails to load is logged and left out, and the rest of the page still renders.

| Block | Needs | What it shows |
| --- | --- | --- |
| What Needs Your Attention | any of the permissions below | Counts that link to the module, open work first (danger, then warning, then info). Items at zero are listed on one line. Quick actions: Report Incident, New Observation, Start Inspection, New Task (each needs its `.create` permission). |
| Tasks Due | `tasks.view` | Open tasks assigned to you, overdue first. |
| Safety Index | `incidents.view`, `inspections.view`, `training.view` or `dot.view` | 1.0's 0–100 score and A–F grade for the last 6 or 12 months, with the inputs, plus the share of DOT driver files that are compliant. |
| Task Scheduler | `tasks.view` | Open tasks overdue, due this week, later and undated, plus counts by status. |
| Incident Trend | `incidents.view` | **12 months:** 1.0's smooth area (wave) chart of incidents per month, with a hover crosshair and a tooltip splitting injuries and other. **3 years / 5 years:** one wave line per year, January to December, this year on top. The tooltip lists every year for the month, and a table gives each year's January-to-this-month total (a fair comparison) and full-year total. Drafts are not counted. |
| Injury History | `incidents.view` or `osha.view` | Five years of injury incidents, plus OSHA recordables, DART cases and days away with `osha.view`. |
| Inspections by Location | `inspections.view` | Inspections in the last 12 months per location. |
| Injury Body Map | `workers_comp.view`, `osha.view` or `incidents.view` | Where on the body injuries happen, for 6 months, 12 months or all time (`?bodyMap=`). |
| My Workspace | none | The modules on your menu, or the ones you pinned. |

### Attention items

| Item | Source and rule |
| --- | --- |
| Incidents awaiting review, returned for changes | `incidents.view`: status `submitted`, `returned` |
| Corrective actions overdue, to verify | `corrective_actions.view`: open past `due_at`; `pending_verification` |
| Inspections in progress, awaiting approval | `inspections.view`: `draft` / `in_progress` / `returned`; `submitted` |
| Observations to review, needing action | `observations.view`: `submitted` / `review`; `action_required` |
| My open tasks (with overdue count) | `tasks.view`: open, in progress or blocked and assigned to you |
| Training overdue | `training.view`: open assignments past their due date (canceled ones never count) |
| Certifications expiring in 30 days (with expired count) | `training.view`: only each person's newest approved passing record per course |
| LOTO procedures past review, in review; open lockouts | `loto.view` |
| Active workers' comp cases, next actions overdue | `workers_comp.view` |
| Driver files and company drivers needing follow-up, DOT records overdue | `dot.view`: the same follow-up kinds as the DOT dashboard |
| Injuries awaiting an OSHA decision | `osha.view` and `incidents.view`: this year's injury incidents (in incident scope) with no live OSHA case |

## Layout

**Customize** opens a panel where you:
- show or hide each block;
- move it up or down;
- pick its size (compact, medium, wide, large, full width; each block allows only the sizes that fit it);
- choose which modules appear in My Workspace.

**Save Layout** keeps it for you in this company; **Reset to Default** deletes it.

- 1.0 kept the layout in the browser. 2.0 keeps it in `forge_dashboard_layouts` (migration `20261116160000_forge_dashboard_layouts.sql`), one row per user and company, so it follows you to other devices. RLS is on, and members and anonymous callers cannot read or write the table. Only the server, with the service role, writes your own row.
- The layout is cleaned on save and on read (`normalizeDashboardLayout`): unknown blocks are dropped, sizes are limited to what the block allows, and blocks added later appear in their default place. The table also checks that the layout is a JSON object under 16 KB.
- A layout never grants access. A block you cannot see stays in your saved order but is not offered in Customize.

## Changes from 1.0

- **Not ported:**
  - The calendar events and reminders blocks. 2.0 has no calendar or reminders module.
  - The body map calibrator and the calendar-year picker. Rolling 6-month, 12-month and all-time periods replace the year picker.
- **Safety Index:** 1.0's formula is unchanged, without the enterprise open-items adjustment. The DOT compliance score is added beside it.
- **Body map:**
  - 2.0 stores body parts as text, so they are matched to 1.0's 31 regions by keyword.
  - An injury on a workers' comp case, an OSHA case and an incident counts once. A WC case and an OSHA case merge when they share the incident and the worker.
  - Labels show case or incident numbers, never employee names.
- **Charts** are hand-drawn SVG (the incident wave, as in 1.0) and plain bars. No chart library is loaded.
- **Year comparison colors** are the first five categorical slots of the reference chart palette, with their own dark-mode steps. They were checked for color-blind separation on this app's light and dark card colors. Three light-mode colors are under 3:1 contrast, so the table under the chart always names each year with its numbers.

## Code

- `apps/web/src/lib/forgeDashboardRules.ts`: pure rules (blocks, layout, safety index, trends, task schedule, renewals, attention order).
- `apps/web/src/lib/forgeDashboard.ts`: `getDashboardData`, `getDashboardLayout`.
- `apps/web/src/lib/forgeBodyMapRules.ts`, `apps/web/src/lib/forgeBodyMap.ts`, `apps/web/public/img/incident-body-map.png`: the body map.
- `apps/web/src/app/(back)/dashboard/`: `page.tsx`, `actions.ts` (`saveDashboardLayout`, `resetDashboardLayout`).
- `apps/web/src/components/dashboard/`: `DashboardBlocks.tsx`, `IncidentTrendChart.tsx`, `DashboardCustomize.tsx`, `SafetyIndexCard.tsx`, `BodyMapCard.tsx`.

## Tests

```bash
node --experimental-strip-types --test apps/web/tests/port-s7-dashboard-rules.test.cjs apps/web/tests/port-s7-body-map-rules.test.cjs
node apps/web/tests/port-s7-dashboard-db.cjs
pnpm exec playwright test apps/web/tests/port-s7-dashboard.spec.cjs --reporter=line --workers=1
```

- **Unit (38):**
  - Dashboard (11): layout defaults and cleaning, pinned modules, safety index and grades, monthly trend, injury history from the OSHA columns, location counts, task schedule and Tasks Due, training renewals, attention order.
  - Body map (27): region parsing, counts, periods and the cross-module dedupe.
- **DB (9 checks):** one row per user and company, the object and size checks, the user foreign key, and no direct access for members or anonymous callers.
- **Browser (2 tests):**
  - Every block in default order, a seeded overdue task in My open tasks and Tasks Due, quick action links, the Safety Index period switch, and an attention card opening its module.
  - Customize hide, resize, move and unpin, saved and reloaded; another user's dashboard unaffected; reset back to the default.
