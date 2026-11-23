# Port slice 14: Emergency Management

Ports Forge 1.0's Emergency Response and Emergency Alerts modules into 2.0. The 1.0 sources, under `legacy/forge-platform`:
- `apps/industrial-web/src/components/emergency-response-workspace.tsx`
- `apps/industrial-web/src/components/emergency-alerts-workspace.tsx`
- `apps/platform-api/src/modules/industrial/industrial-emergency-alerts.service.ts`
- `apps/platform-api/src/modules/industrial/industrial-emergency-alerts-audience.ts`

The 2.0 menu: Emergency Management → **Emergency Alerts** (`/emergency/alerts`) and **Emergency Plans** (`/emergency`).

## What it does

- **Emergency Plans** (`/emergency`, `/emergency/new`, `/emergency/[id]`, `/emergency/[id]/edit`), in four kinds:
  - **Action plans**: a procedure, location (blank for company-wide), status (draft, active or retired) and a next review date, with an overdue or due-soon warning.
  - **Scenario procedures**: like a plan, plus the type of emergency (fire, evacuation, shelter in place, severe weather, chemical release, medical, security, utility failure or other) and an optional link to an action plan.
  - **Drills**: date, emergency type, linked plan, participants, duration, notes, and status (scheduled, completed or canceled). A drill can't be marked completed without an after-action review. A plan lists the scenarios and drills linked to it.
  - **Response teams**: duties, plus members from personnel, each with a role on the team; their job title and phone are shown.
  - All four can be archived and restored. Everyone with view access sees all but drafts. Editors see drafts too.
- **Emergency Alerts** (`/emergency/alerts`, `/emergency/alerts/new`, `/emergency/alerts/[id]`, `/emergency/alerts/templates`):
  - **Compose:**
    - Fields: type (general, fire, evacuation, shelter in place, severe weather, chemical release, medical, security or utility failure), severity (extreme, severe, moderate or minor), headline, message and instructions.
    - It can be a drill, and it can ask people to say they're safe.
    - It can start from a template.
    - A live preview shows what people will see. Drills are marked `[DRILL]`.
  - **Audience:** the whole company, or any mix of locations, departments and named people (an OR, as in 1.0).
    - "Check who it reaches" shows the count, sample names, and who won't be reached and why: no Forge account, not an active employee, or account not active in the company.
    - Sending needs the check and a second confirmation.
  - **Delivery:** an in-app notice and an email to each recipient, through the shared outbox (`/api/helpdesk/cron` sends the email).
  - **Responses:** recipients answer **I'm safe** or **I need help**, with an optional note, and can change their answer while the alert is active.
    - "I need help" notifies the sender right away, by in-app notice and email.
    - The Alerts page tells you which alerts are waiting for your answer.
  - **Roll call:** for people who can see the alert in their scope, recipients are listed with need help first, then no response, then safe. It shows counts and the percent accounted for.
  - **Update** (new severity or message) and **All clear** both go to everyone the alert was sent to. All-clear closes responses. Every step is on the alert's timeline.
  - **Templates:** ready-made messages, which can be turned off so they aren't offered.

## Fixes over 1.0

- **Plans are real records.** In 1.0, plans, drills and teams were one title row per "category" and categories were matched by title text. There was no edit, archive, review date, drill result or team membership.
- **Sending is protected.**
  - Sending a live alert needs `emergency_alerts.send`. 1.0 let anyone with basic Industrial access send, change SMS settings and manage groups.
  - Drills have their own permission, so supervisors can run drills without being able to send a live alert.
  - A location-scoped sender can only alert their own locations: no company-wide alerts, and no departments or named people, which reach other sites. The server re-checks this on every send.
- **Updates and all-clear reach the original recipients.** 1.0 changed the record and told nobody, although its confirm dialog said it would.
- **Responses are locked down.**
  - Only recipients can respond, only while the alert is active and asks for a response. 1.0 took a free-text acknowledgment from anyone who could view alerts, for any active alert.
  - Responses are safe or need help, and need help reaches the sender.
- **No unconfirmed sends or silent caps.**
  - Sending needs a confirmation, which the server requires.
  - Audiences are capped at 5,000 people with a clear message. 1.0 silently capped at 5,000 people and 200 in-app notices.
- **People who can't be reached are named**, so the sender knows who to call.
- **History is protected by triggers.**
  - What an alert said, who it went to, and every step can't be rewritten.
  - A cleared alert is frozen.
  - An alert's type, drill flag, audience and sender never change.

## Permissions

- **Emergency plans:**
  - `emergency_management.view`: see plans. The existing grants are kept, including employees at their own location; safety managers are added.
  - `emergency_management.edit`: manage plans. Location scope manages only plans at its locations; company-wide plans need organization scope.
- **New, under the Emergency Alerts feature:**
  - `emergency_alerts.view`: see alerts and roll calls in your scope. Everyone always sees and answers the alerts sent to them.
  - `emergency_alerts.run_drills`
  - `emergency_alerts.send`: critical, needs confirmation.
  - `emergency_alerts.manage_templates`
- **Retired:** `emergency_management.send_alerts`, which nothing in 2.0 used, is no longer assignable and its grants were removed.
- **Grants:**
  - Employees: no alert permissions; they answer the alerts sent to them.
  - Supervisors: view alerts and run drills, at location scope.
  - Location administrators: edit plans, view alerts, run drills and send, at location scope.
  - Safety managers, company admins, company administrators and owners: everything, company-wide.

## Schema

`20261119140000_s14_emergency.sql`:
- **Features and menu:** updates the `emergency_management` and `emergency_alerts` features, adds plan entitlements (internal-demo, enterprise), and adds the menu entries `nav.emergency_alerts` and `nav.emergency_plans` under Emergency Management.
- **Tables:**
  - `forge_emergency_plans`: all four kinds, with per-kind check constraints.
  - `forge_emergency_team_members`
  - `forge_emergency_alert_templates`
  - `forge_emergency_alerts`
  - `forge_emergency_alert_updates`: issued, update and all-clear.
  - `forge_emergency_alert_recipients`
  - `forge_emergency_alert_responses`: its foreign key is to the recipient row, so only recipients can respond.
  - All have RLS on, no anon or authenticated access, and service role only.
- **Triggers:**
  - `forge_emergency_same_organization`: one company; team members only on teams; recipients must be active members.
  - `forge_emergency_history_immutable`: updates and recipients can't change.
  - `forge_emergency_alert_guard`: only the message, severity and status change; status only goes active to cleared; a cleared alert is frozen.
  - `forge_emergency_response_guard`: responses only while the alert is active and asks for one.

## Tests

- **Unit:** `node --experimental-strip-types --test apps/web/tests/port-s14-emergency-rules.test.cjs` (8). Covers the plan and drill rules, review state, alert messages, notice wording, audience cleaning and scope, audience resolution and exclusions, roll call, and responses.
- **Database:** `node apps/web/tests/port-s14-emergency-db.cjs`. Covers checks, one company, teams, the alert guard, immutable history, members-only recipients, recipient-only responses, a frozen cleared alert, no direct access, and permissions and grants.
- **Playwright:** `port-s14-emergency.spec.cjs` (4). Covers:
  - a plan, a drill that needs its after-action review, and a team with a member;
  - a company-wide drill alert with audience check and confirmation;
  - the employee answering "I need help", being blocked from sending, and getting a 404 for an alert not sent to them;
  - the roll call and help notice, then update and all-clear, with the employee's response closed.
- **Not in CI:** like slices 8–13, these aren't in the CI workflow yet.

## Remaining

- SMS delivery: provider, per-person SMS consent and opt-out, the QR self-signup, and delivery receipts. In 1.0 this used AWS End User Messaging; 2.0 has no SMS provider yet. The delivery table already allows an `sms` channel.
- The CAP / digital signage (Mvix) feed.
- Saved audience groups. 1.0 had static and dynamic groups; here, locations, departments and people are picked each time.
- An alert approval step. 1.0 had the statuses but never used them.
- Dashboard tile for alerts waiting on you, and a site-wide banner while an alert is active.
- Drill reminders and a plan review-due reminder cron.
- Raising a corrective action from a drill's after-action review.
- Recipients are people with a Forge account. Employees without one are listed as not reached and get nothing until SMS exists.
- 1.0 data migration: emergency response records, alerts and templates.
