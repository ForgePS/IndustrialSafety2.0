/**
 * Restore UAT Creator display name after accidental rename.
 * APPLY=1 to write.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const EMAIL = "forge-uat-creator@forgepublicsafety.com";

async function resolveDatabaseUrl(secretArn) {
  const region = process.env.AWS_REGION || "us-east-1";
  const client = new SecretsManagerClient({ region });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = JSON.parse(res.SecretString);
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  const port = Number(raw.port ?? 5432);
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${host}:${port}/${dbname}`;
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });
  try {
    const [user] = await sql`
      select u.id::text as user_id, u.person_id::text as person_id, u.username,
             p.display_name, p.first_name, p.last_name
      from users u
      left join persons p on p.id = u.person_id
      where lower(u.primary_email) = ${EMAIL}
      limit 1
    `;
    if (!user) throw new Error(`User not found: ${EMAIL}`);
    if (APPLY && user.person_id) {
      await sql`
        update persons
        set display_name = 'Forge UAT Creator',
            first_name = 'Forge',
            last_name = 'UAT Creator',
            updated_at = now()
        where id = ${user.person_id}::uuid
      `;
      await sql`
        update users
        set username = 'Forge UAT Creator', updated_at = now()
        where id = ${user.user_id}::uuid
      `;
    }
    console.log(JSON.stringify({ apply: APPLY, email: EMAIL, before: user }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
