#!/usr/bin/env node
/**
 * Seed original Forge demo training content (LOTO + Confined Space).
 * Runs inside platform-api ECS or locally with DATABASE_SECRET_ARN / DATABASE_URL.
 *
 * Env:
 *   DATABASE_SECRET_ARN or DATABASE_URL
 *   FORGE_TRAINING_SEED_TENANT_ID (required)
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const apiRequire = createRequire(
  process.env.FORGE_SEED_REQUIRE_FROM || "/app/apps/platform-api/package.json",
);

async function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const secretArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!secretArn) throw new Error("DATABASE_SECRET_ARN or DATABASE_URL required");
  const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
    "@aws-sdk/client-secrets-manager",
  );
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "us-east-1" });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = JSON.parse(res.SecretString);
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  const port = Number(raw.port ?? 5432);
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${host}:${port}/${dbname}`;
}

const DEMO = [
  {
    title: "Lockout/Tagout Essentials",
    edition: "Forge Demo 2026",
    description: "Original Forge practice content for energy isolation awareness.",
    chapters: [
      {
        title: "Energy Control Basics",
        questions: [
          {
            stem: "What is the primary purpose of lockout/tagout?",
            choices: [
              "To speed up equipment repairs",
              "To control hazardous energy during service",
              "To replace PPE requirements",
              "To document production metrics",
            ],
            correctIndex: 1,
            explanation: "LOTO isolates hazardous energy so work can be performed safely.",
            pageRef: "LOTO-1",
          },
          {
            stem: "Who may remove a personal lock on an energy-isolating device?",
            choices: [
              "Any supervisor on shift",
              "The authorized employee who applied it (or approved exception process)",
              "Any coworker with a key",
              "Facilities contractors only",
            ],
            correctIndex: 1,
            explanation: "Personal locks are removed by the employee who applied them, except via defined emergency procedures.",
            pageRef: "LOTO-2",
          },
        ],
      },
      {
        title: "Verification",
        questions: [
          {
            stem: "Before beginning work after isolation, authorized employees should:",
            choices: [
              "Start the machine briefly to confirm power",
              "Verify zero energy state using established methods",
              "Remove tags to declutter the area",
              "Skip verification if the lock is present",
            ],
            correctIndex: 1,
            explanation: "Verification confirms isolation before work starts.",
            pageRef: "LOTO-3",
          },
        ],
      },
    ],
  },
  {
    title: "Confined Space Awareness",
    edition: "Forge Demo 2026",
    description: "Original Forge practice content for confined space entry awareness.",
    chapters: [
      {
        title: "Recognizing Spaces",
        questions: [
          {
            stem: "A confined space typically has:",
            choices: [
              "Unlimited egress and continuous occupancy",
              "Limited means of entry/exit and is not designed for continuous occupancy",
              "Only outdoor open areas",
              "No atmospheric hazards by definition",
            ],
            correctIndex: 1,
            explanation: "Confined spaces have limited entry/exit and are not meant for continuous occupancy.",
            pageRef: "CS-1",
          },
          {
            stem: "Atmospheric testing before entry is used to:",
            choices: [
              "Measure noise levels only",
              "Evaluate oxygen, flammable gases, and toxic contaminants as required",
              "Replace the need for a permit",
              "Document production cycle time",
            ],
            correctIndex: 1,
            explanation: "Testing checks critical atmospheric conditions prior to entry.",
            pageRef: "CS-2",
          },
        ],
      },
    ],
  },
];

async function main() {
  const tenantId = process.env.FORGE_TRAINING_SEED_TENANT_ID?.trim();
  if (!tenantId) throw new Error("FORGE_TRAINING_SEED_TENANT_ID required");

  let postgres;
  try {
    const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
    postgres = (await import(pathToFileURL(dbRequire.resolve("postgres")).href)).default;
  } catch {
    const postgresMod = await import("postgres");
    postgres = postgresMod.default ?? postgresMod;
  }

  const sql = postgres(await resolveDatabaseUrl(), { max: 1 });
  try {
    await sql`select set_config('app.current_tenant_id', ${tenantId}, false)`;
    const created = [];
    for (const src of DEMO) {
      const existing = await sql`
        select id::text as id from industrial_training_sources
        where tenant_id = ${tenantId}::uuid and title = ${src.title} and archived_at is null
        limit 1
      `;
      if (existing[0]) {
        created.push({ title: src.title, skipped: true, id: existing[0].id });
        continue;
      }
      const sourceId = randomUUID();
      const now = new Date().toISOString();
      await sql`
        insert into industrial_training_sources (
          id, tenant_id, title, edition, description, status, chapter_count, question_count,
          published_at, created_at, updated_at
        ) values (
          ${sourceId}::uuid, ${tenantId}::uuid, ${src.title}, ${src.edition}, ${src.description},
          'PUBLISHED', ${src.chapters.length},
          ${src.chapters.reduce((n, c) => n + c.questions.length, 0)},
          ${now}::timestamptz, ${now}::timestamptz, ${now}::timestamptz
        )
      `;
      let chapterOrder = 0;
      for (const ch of src.chapters) {
        const chapterId = randomUUID();
        await sql`
          insert into industrial_training_chapters (
            id, tenant_id, source_id, title, sort_order, status, created_at, updated_at
          ) values (
            ${chapterId}::uuid, ${tenantId}::uuid, ${sourceId}::uuid, ${ch.title},
            ${chapterOrder++}, 'ACTIVE', ${now}::timestamptz, ${now}::timestamptz
          )
        `;
        for (const q of ch.questions) {
          const qid = randomUUID();
          await sql`
            insert into industrial_training_questions (
              id, tenant_id, source_id, chapter_id, stem, choices, correct_index,
              explanation, page_ref, difficulty, status, created_at, updated_at
            ) values (
              ${qid}::uuid, ${tenantId}::uuid, ${sourceId}::uuid, ${chapterId}::uuid,
              ${q.stem}, ${sql.json(q.choices)}, ${q.correctIndex},
              ${q.explanation}, ${q.pageRef}, 'MEDIUM', 'PUBLISHED',
              ${now}::timestamptz, ${now}::timestamptz
            )
          `;
        }
      }
      created.push({ title: src.title, skipped: false, id: sourceId });
    }
    console.log(JSON.stringify({ ok: true, tenantId, created }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  process.exit(1);
});
