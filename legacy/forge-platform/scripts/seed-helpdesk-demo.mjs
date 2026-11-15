/**
 * Help Desk demo data for local/dev environments ONLY.
 *
 * Creates (or reuses) the fictional demo tenant "Northstar Manufacturing"
 * (tenant_key northstar-demo, is_demo_tenant = true) and loads ~15 support
 * tickets across every status, priority, request type, and conversation shape,
 * including internal notes, so the Help Center and Support Console can be
 * exercised without touching customer data.
 *
 * Production starts clean; real starter content (request types, product areas,
 * tags) ships in migration 0108. Never run this against production.
 *
 * Env:
 *   DATABASE_URL               default: local forge_platform_local
 *   APPLY=1                    write; otherwise prints the plan (dry run)
 *   AGENT_EMAIL                optional existing user to assign tickets to
 *   REQUESTER_EMAIL            optional existing Northstar user to own the tickets
 *   HELPDESK_DEMO_ALLOW_REMOTE=1  allow a non-localhost database (dev/staging only)
 *
 * Re-running replaces the previous demo tickets (matched by client_request_id prefix).
 *
 *   node scripts/seed-helpdesk-demo.mjs
 *   APPLY=1 node scripts/seed-helpdesk-demo.mjs
 */
import { randomUUID } from "node:crypto";
import { defaultLocalDatabaseUrl, loadPostgres } from "./seed-db-client.mjs";

const DATABASE_URL = process.env.DATABASE_URL || defaultLocalDatabaseUrl();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const TENANT_KEY = "northstar-demo";
const TENANT_NAME = "Northstar Manufacturing";
const DEMO_PREFIX = "helpdesk-demo-seed-";

function fail(error, extra = {}) {
  console.error(JSON.stringify({ ok: false, error, ...extra }));
  process.exit(1);
}

const env = `${process.env.APP_ENV ?? ""} ${process.env.NODE_ENV ?? ""}`.toLowerCase();
if (env.includes("prod")) fail("refusing_production_environment");
const host = (() => {
  try {
    return new URL(DATABASE_URL).hostname;
  } catch {
    return "";
  }
})();
const isLocal = ["localhost", "127.0.0.1", "::1", "host.docker.internal"].includes(host);
if (!isLocal && process.env.HELPDESK_DEMO_ALLOW_REMOTE !== "1") {
  fail("refusing_remote_database", {
    host,
    hint: "Set HELPDESK_DEMO_ALLOW_REMOTE=1 for a dev/staging database.",
  });
}

const REQUESTERS = [
  { name: "Dana Whitfield", email: "dana.whitfield@northstar.example" },
  { name: "Marcus Lee", email: "marcus.lee@northstar.example" },
  { name: "Priya Raman", email: "priya.raman@northstar.example" },
  { name: "Tom Okafor", email: "tom.okafor@northstar.example" },
];

const TECH = {
  route: "/help-desk/",
  browser: "Chrome",
  browserVersion: "129.0",
  os: "Windows",
  deviceType: "desktop",
  isMobile: false,
  viewportWidth: 1536,
  viewportHeight: 754,
  appVersion: "demo",
  timezone: "America/Chicago",
  locale: "en-US",
};
const MOBILE_TECH = {
  ...TECH,
  browser: "Safari",
  browserVersion: "18.0",
  os: "iOS",
  deviceType: "phone",
  isMobile: true,
  viewportWidth: 390,
  viewportHeight: 844,
};

/** days: age of the ticket; thread: [author, type, body, hoursAfterCreate]. */
const TICKETS = [
  {
    subject: "Inspection photos fail to upload from tablet",
    description:
      "When I attach photos to a forklift inspection on the shop-floor tablet the upload spins and then says failed. Desktop works fine.",
    requestType: "MOBILE_APP_ISSUE",
    productArea: "INSPECTIONS",
    severity: "P2_HIGH",
    priority: "P2_HIGH",
    status: "IN_PROGRESS",
    days: 2,
    requester: 0,
    assigned: true,
    tech: MOBILE_TECH,
    tags: ["mobile", "inspection"],
    thread: [
      [
        "support",
        "SUPPORT_REPLY",
        "Thanks Dana. Which tablet model and roughly how large are the photos?",
        3,
      ],
      [
        "customer",
        "CUSTOMER_MESSAGE",
        "Samsung Galaxy Tab A8. Photos are straight from the camera, about 6 MB each.",
        5,
      ],
      [
        "support",
        "INTERNAL_NOTE",
        "Reproduced on Android 14 with >5 MB images. Likely the client-side resize path. Escalating to engineering.",
        20,
      ],
    ],
  },
  {
    subject: "Cannot log in after password reset",
    description:
      "I reset my password this morning and now the login page says my credentials are invalid.",
    requestType: "ACCOUNT_LOGIN",
    productArea: "ADMINISTRATION",
    severity: "P2_HIGH",
    priority: "P2_HIGH",
    status: "NEW",
    days: 0,
    requester: 1,
    assigned: false,
    tech: TECH,
    tags: ["login"],
    thread: [],
  },
  {
    subject: "OSHA 300 log shows the wrong establishment name",
    description:
      "The printed 300 log header shows our old plant name. Company profile has the new name.",
    requestType: "DATA_ISSUE",
    productArea: "OSHA_REPORTING",
    severity: "P3_NORMAL",
    priority: "P3_NORMAL",
    status: "WAITING_ON_CUSTOMER",
    days: 4,
    requester: 2,
    assigned: true,
    tech: TECH,
    tags: ["data"],
    thread: [
      [
        "support",
        "SUPPORT_REPLY",
        "The 300 log uses the establishment record, not the company profile. Can you confirm the establishment under Settings > Locations?",
        6,
      ],
    ],
  },
  {
    subject: "How do I assign training to a whole department?",
    description:
      "We have a new forklift refresher course and need it assigned to everyone in Shipping.",
    requestType: "HOW_DO_I",
    productArea: "TRAINING",
    severity: "P4_LOW",
    priority: "P4_LOW",
    status: "RESOLVED",
    days: 6,
    requester: 3,
    assigned: true,
    tech: TECH,
    disposition: "TRAINING_ISSUE",
    tags: ["training"],
    thread: [
      [
        "support",
        "SUPPORT_REPLY",
        "Open Training > Assignments, choose Bulk assign, then filter by Department = Shipping. Let us know if that does it!",
        2,
      ],
      ["customer", "CUSTOMER_MESSAGE", "Perfect, that worked. Thank you.", 4],
    ],
  },
  {
    subject: "Add a signature field to the LOTO procedure printout",
    description:
      "Our auditors want an authorized-employee signature line on each printed LOTO procedure.",
    requestType: "FEATURE_REQUEST",
    productArea: "LOTO",
    severity: "P4_LOW",
    priority: "P4_LOW",
    status: "WAITING_ON_FORGE",
    days: 12,
    requester: 0,
    assigned: true,
    tech: TECH,
    disposition: "FEATURE_REQUEST",
    tags: ["feature-request"],
    thread: [
      [
        "support",
        "SUPPORT_REPLY",
        "Great suggestion. We've logged this with the product team and will update you when it is scheduled.",
        8,
      ],
      [
        "support",
        "INTERNAL_NOTE",
        "Two other customers asked for this. Linked to roadmap item LOTO-PRINT-SIG.",
        9,
      ],
    ],
  },
  {
    subject: "Dashboard is blank for supervisors",
    description: "Since this morning supervisors see an empty dashboard. Admins see everything.",
    requestType: "TECHNICAL_ISSUE",
    productArea: "DASHBOARD",
    severity: "P1_CRITICAL",
    priority: "P1_CRITICAL",
    status: "TRIAGE",
    days: 0,
    requester: 1,
    assigned: false,
    tech: TECH,
    tags: ["bug", "critical-client"],
    thread: [],
  },
  {
    subject: "Permission to edit incidents for safety leads",
    description:
      "Our safety leads can view incidents but cannot edit them. What permission do they need?",
    requestType: "PERMISSIONS",
    productArea: "INCIDENTS",
    severity: "P3_NORMAL",
    priority: "P3_NORMAL",
    status: "CLOSED",
    days: 20,
    requester: 2,
    assigned: true,
    tech: TECH,
    disposition: "CONFIGURATION_ISSUE",
    tags: ["permissions"],
    thread: [
      [
        "support",
        "SUPPORT_REPLY",
        "Grant the Incidents - Edit permission to the Safety Lead role under Settings > Roles.",
        1,
      ],
      ["customer", "CUSTOMER_MESSAGE", "Done, all set.", 3],
    ],
  },
  {
    subject: "QR code labels print too small",
    description: "Equipment QR labels come out at about half size on our Brady printer.",
    requestType: "TECHNICAL_ISSUE",
    productArea: "QR_CODES",
    severity: "P3_NORMAL",
    priority: "P3_NORMAL",
    status: "ASSIGNED",
    days: 1,
    requester: 3,
    assigned: true,
    tech: TECH,
    tags: [],
    thread: [],
  },
  {
    subject: "Duplicate employees after spreadsheet import",
    description: "We imported our roster and now about 40 employees appear twice.",
    requestType: "DATA_ISSUE",
    productArea: "PERSONNEL",
    severity: "P2_HIGH",
    priority: "P2_HIGH",
    status: "REOPENED",
    days: 9,
    requester: 0,
    assigned: true,
    tech: TECH,
    tags: ["data"],
    thread: [
      [
        "support",
        "SUPPORT_REPLY",
        "We merged the duplicates; matching was on name only because employee IDs were blank.",
        24,
      ],
      [
        "customer",
        "CUSTOMER_MESSAGE",
        "A few are still duplicated - see Shipping department.",
        100,
      ],
    ],
  },
  {
    subject: "Training request for new EHS coordinator",
    description: "We hired a new EHS coordinator and would like a 1-hour onboarding session.",
    requestType: "TRAINING_REQUEST",
    productArea: "OTHER",
    severity: "P4_LOW",
    priority: "P4_LOW",
    status: "NEW",
    days: 1,
    requester: 2,
    assigned: false,
    tech: TECH,
    tags: [],
    thread: [],
  },
  {
    subject: "Invoice shows wrong seat count",
    description: "Our latest invoice bills for 120 seats; we have 95 active users.",
    requestType: "BILLING_SUBSCRIPTION",
    productArea: "ADMINISTRATION",
    severity: "P3_NORMAL",
    priority: "P3_NORMAL",
    status: "IN_PROGRESS",
    days: 3,
    requester: 1,
    assigned: true,
    tech: TECH,
    tags: ["billing"],
    thread: [
      [
        "support",
        "INTERNAL_NOTE",
        "Billing count includes 25 disabled users - confirm with finance before replying.",
        2,
      ],
    ],
  },
  {
    subject: "DOT driver file reminder emails not sending",
    description: "Medical card expiration reminders stopped arriving last week.",
    requestType: "INTEGRATION_ISSUE",
    productArea: "DOT_COMPLIANCE",
    severity: "P2_HIGH",
    priority: "P2_HIGH",
    status: "RESOLVED",
    days: 8,
    requester: 3,
    assigned: true,
    tech: TECH,
    disposition: "BUG_CONFIRMED",
    tags: ["bug", "integration"],
    thread: [
      [
        "support",
        "SUPPORT_REPLY",
        "We found and fixed a scheduling issue. Reminders resumed this morning and the missed ones were re-sent.",
        30,
      ],
    ],
  },
  {
    subject: "Corrective action due dates shift by one day",
    description: "Due dates entered as the 15th show as the 14th on the list view.",
    requestType: "REPORT_PROBLEM",
    productArea: "CORRECTIVE_ACTIONS",
    severity: "P3_NORMAL",
    priority: "P3_NORMAL",
    status: "WAITING_ON_FORGE",
    days: 5,
    requester: 0,
    assigned: true,
    tech: TECH,
    disposition: "KNOWN_ISSUE",
    tags: ["bug", "known-issue"],
    thread: [
      [
        "support",
        "SUPPORT_REPLY",
        "This is a known time-zone display issue. A fix is in testing; we'll update you when it ships.",
        4,
      ],
    ],
  },
  {
    subject: "Ask Forge gave an outdated OSHA reference",
    description: "Ask Forge cited a recordkeeping rule that was updated last year.",
    requestType: "OTHER",
    productArea: "ASK_FORGE",
    severity: "P4_LOW",
    priority: "P4_LOW",
    status: "CLOSED",
    days: 30,
    requester: 2,
    assigned: true,
    tech: TECH,
    disposition: "WORKING_AS_DESIGNED",
    tags: [],
    thread: [
      [
        "support",
        "SUPPORT_REPLY",
        "Thanks for flagging. The knowledge source has been refreshed.",
        10,
      ],
    ],
  },
  {
    subject: "Emergency alert test did not reach night shift",
    description: "During Tuesday's drill, night shift phones did not receive the alert.",
    requestType: "TECHNICAL_ISSUE",
    productArea: "EMERGENCY_MANAGEMENT",
    severity: "P1_CRITICAL",
    priority: "P1_CRITICAL",
    status: "IN_PROGRESS",
    days: 1,
    requester: 1,
    assigned: true,
    tech: MOBILE_TECH,
    tags: ["mobile", "critical-client"],
    thread: [
      [
        "support",
        "SUPPORT_REPLY",
        "We're investigating now. Can you confirm whether night shift users have phone numbers on their profiles?",
        1,
      ],
      ["customer", "CUSTOMER_MESSAGE", "About half do not. Could that be it?", 2],
      [
        "support",
        "INTERNAL_NOTE",
        "Yes - SMS channel skipped users without phone. Recommend profile cleanup + push fallback.",
        3,
      ],
    ],
  },
];

const hours = (n) => n * 3_600_000;

async function main() {
  const postgres = await loadPostgres();
  const sql = postgres(DATABASE_URL, { max: 1 });
  try {
    const plan = { tenant: TENANT_NAME, tickets: TICKETS.length, apply: APPLY, host };
    if (!APPLY) {
      console.log(
        JSON.stringify(
          { ok: true, dryRun: true, ...plan, statuses: TICKETS.map((t) => t.status) },
          null,
          2,
        ),
      );
      return;
    }

    const result = await sql.begin(async (tx) => {
      await tx`select set_config('app.bypass_rls', 'on', true)`;

      let [tenant] =
        await tx`select id, is_demo_tenant from tenants where tenant_key = ${TENANT_KEY}`;
      if (tenant && !tenant.is_demo_tenant)
        throw new Error(`Tenant ${TENANT_KEY} exists but is not a demo tenant`);
      if (!tenant) {
        const id = randomUUID();
        await tx`
          insert into tenants (id, tenant_key, slug, legal_name, display_name, tenant_type, status, is_demo_tenant)
          values (${id}, ${TENANT_KEY}, ${TENANT_KEY}, ${`${TENANT_NAME} (Demo)`}, ${TENANT_NAME}, 'CUSTOMER', 'ACTIVE', true)`;
        tenant = { id };
      }
      const tenantId = tenant.id;

      const agent = process.env.AGENT_EMAIL
        ? (
            await tx`select id, primary_email from users where lower(primary_email) = lower(${process.env.AGENT_EMAIL}) limit 1`
          )[0]
        : null;
      const requesterUser = process.env.REQUESTER_EMAIL
        ? (
            await tx`select id from users where tenant_id = ${tenantId} and lower(primary_email) = lower(${process.env.REQUESTER_EMAIL}) limit 1`
          )[0]
        : null;
      const agentName = agent ? agent.primary_email : null;

      const old =
        await tx`select id from support_tickets where tenant_id = ${tenantId} and client_request_id like ${`${DEMO_PREFIX}%`}`;
      const oldIds = old.map((r) => r.id);
      if (oldIds.length) {
        await tx`delete from support_ticket_tags where ticket_id = any(${oldIds}::uuid[])`;
        await tx`delete from support_ticket_watchers where ticket_id = any(${oldIds}::uuid[])`;
        await tx`delete from support_ticket_events where ticket_id = any(${oldIds}::uuid[])`;
        await tx`delete from support_ticket_messages where ticket_id = any(${oldIds}::uuid[])`;
        await tx`delete from support_tickets where id = any(${oldIds}::uuid[])`;
      }

      const tagRows = await tx`select id, slug from support_tags where tenant_id is null`;
      const tagBySlug = new Map(tagRows.map((r) => [r.slug, r.id]));

      let created = 0;
      for (const [index, t] of TICKETS.entries()) {
        const id = randomUUID();
        const requester = REQUESTERS[t.requester];
        const createdAt = new Date(Date.now() - t.days * 86_400_000 - hours(index));
        const year = createdAt.getUTCFullYear();
        const [{ last_value: seq }] = await tx`
          insert into support_ticket_sequences (year, last_value, updated_at) values (${year}, 1, now())
          on conflict (year) do update set last_value = support_ticket_sequences.last_value + 1, updated_at = now()
          returning last_value`;
        const ticketNumber = `SUP-${year}-${String(seq).padStart(6, "0")}`;
        const firstSupport = t.thread.find(
          ([who, type]) => who === "support" && type === "SUPPORT_REPLY",
        );
        const lastAt = new Date(createdAt.getTime() + hours(t.thread.at(-1)?.[3] ?? 0));
        const assigned = t.assigned && agent;

        await tx`
          insert into support_tickets (
            id, tenant_id, product_code, ticket_number, requester_user_id, requester_name, requester_email,
            request_type, product_area, subject, description, customer_reported_severity, priority, status,
            disposition, assigned_team, assigned_user_id, assigned_user_name, source, technical_context,
            client_request_id, first_response_at, last_customer_activity_at, last_support_activity_at,
            resolved_at, closed_at, reopened_at, created_at, updated_at
          ) values (
            ${id}, ${tenantId}, 'FORGE_INDUSTRIAL', ${ticketNumber}, ${requesterUser?.id ?? null}, ${requester.name}, ${requester.email},
            ${t.requestType}, ${t.productArea}, ${t.subject}, ${t.description}, ${t.severity}, ${t.priority}, ${t.status},
            ${t.disposition ?? null}, ${t.assigned ? "Tier 1" : null}, ${assigned ? agent.id : null}, ${assigned ? agentName : null},
            ${t.tech.isMobile ? "MOBILE" : "WEB"}, ${tx.json(t.tech)},
            ${`${DEMO_PREFIX}${index}`}, ${firstSupport ? new Date(createdAt.getTime() + hours(firstSupport[3])) : null},
            ${createdAt}, ${t.thread.some(([w]) => w === "support") ? lastAt : null},
            ${t.status === "RESOLVED" || t.status === "CLOSED" ? lastAt : null}, ${t.status === "CLOSED" ? lastAt : null},
            ${t.status === "REOPENED" ? lastAt : null}, ${createdAt}, ${lastAt}
          )`;

        await tx`
          insert into support_ticket_events (id, tenant_id, ticket_id, event_type, to_value, actor_name, actor_type, created_at)
          values (${randomUUID()}, ${tenantId}, ${id}, 'CREATED', 'NEW', ${requester.name}, 'CUSTOMER', ${createdAt})`;

        for (const [who, type, body, h] of t.thread) {
          const support = who === "support";
          await tx`
            insert into support_ticket_messages (id, tenant_id, ticket_id, author_user_id, author_name, author_type, message_type, body, is_internal, created_at, updated_at)
            values (
              ${randomUUID()}, ${tenantId}, ${id}, ${support && agent ? agent.id : null},
              ${support ? (agentName ?? "Forge Support") : requester.name}, ${support ? "SUPPORT" : "CUSTOMER"},
              ${type}, ${body}, ${type === "INTERNAL_NOTE"}, ${new Date(createdAt.getTime() + hours(h))}, ${new Date(createdAt.getTime() + hours(h))}
            )`;
        }

        if (t.status !== "NEW") {
          await tx`
            insert into support_ticket_events (id, tenant_id, ticket_id, event_type, from_value, to_value, actor_name, actor_type, created_at)
            values (${randomUUID()}, ${tenantId}, ${id}, 'STATUS_CHANGED', 'NEW', ${t.status}, ${agentName ?? "Forge Support"}, 'SUPPORT', ${lastAt})`;
        }

        for (const slug of t.tags) {
          const tagId = tagBySlug.get(slug);
          if (!tagId) continue;
          await tx`insert into support_ticket_tags (tenant_id, ticket_id, tag_id) values (${tenantId}, ${id}, ${tagId}) on conflict do nothing`;
        }
        created += 1;
      }
      return {
        tenantId,
        created,
        replaced: oldIds.length,
        agentAssigned: Boolean(agent),
        requesterLinked: Boolean(requesterUser),
      };
    });

    console.log(JSON.stringify({ ok: true, ...plan, ...result }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) =>
  fail("seed_failed", { message: err instanceof Error ? err.message : String(err) }),
);
