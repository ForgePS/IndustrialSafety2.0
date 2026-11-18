#!/usr/bin/env node
/**
 * Verify local training UAT seed data in Postgres.
 * Usage: node scripts/verify-local-training-uat.mjs
 */
import { spawnSync } from "node:child_process";
import { loadPostgres } from "./seed-db-client.mjs";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://forge:forge_local_only@localhost:5432/forge_platform_local";

async function main() {
  const postgres = await loadPostgres();
  const sql = postgres(DATABASE_URL, { max: 1 });
  try {
    const [person] = await sql`
      select id::text as id, display_name, employee_number
      from industrial_personnel
      where employee_number = '10452' and archived_at is null
      limit 1
    `;
    const [assignment] = await sql`
      select id::text as id, title, passing_percent
      from industrial_training_assignments
      where title = 'Annual Lockout/Tagout Training' and archived_at is null
      limit 1
    `;
    const assignee = assignment
      ? await sql`
          select status, employee_number
          from industrial_training_assignment_assignees
          where assignment_id = ${assignment.id}::uuid
            and employee_number = '10452'
          limit 1
        `
      : [];
    const sections = assignment
      ? await sql`
          select count(*)::int as c
          from industrial_training_course_sections s
          join industrial_training_course_versions v on v.id = s.version_id
          join industrial_training_assignments a on a.course_version_id = v.id
          where a.id = ${assignment.id}::uuid
        `
      : [{ c: 0 }];
    const [access] = await sql`
      select id::text as id, public_token_hash is not null as has_token
      from industrial_training_access_links
      where title = 'Company training portal (UAT)' and archived_at is null
      limit 1
    `;
    const questions = await sql`
      select count(*)::int as c
      from industrial_training_questions q
      join industrial_training_sources s on s.id = q.source_id
      where s.title = 'Lockout/Tagout Essentials' and q.status = 'PUBLISHED'
    `;

    const checks = {
      johnSmith: Boolean(person),
      lotoAssignment: Boolean(assignment),
      assigneeLinked: assignee.length > 0,
      courseSections: (sections[0]?.c ?? 0) >= 2,
      accessLinkWithToken: Boolean(access?.has_token),
      publishedQuestions: (questions[0]?.c ?? 0) >= 2,
      passingPercent80: assignment?.passing_percent === 80,
    };
    const pass = Object.values(checks).every(Boolean);

    console.log(
      JSON.stringify(
        {
          pass,
          checks,
          person,
          assignment,
          assignee: assignee[0] ?? null,
          accessLinkId: access?.id ?? null,
          sectionCount: sections[0]?.c ?? 0,
          questionCount: questions[0]?.c ?? 0,
        },
        null,
        2,
      ),
    );

    if (!pass) process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
