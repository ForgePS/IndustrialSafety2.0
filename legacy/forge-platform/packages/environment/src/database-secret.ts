import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

export interface RdsSecretFields {
  host: string;
  port: number;
  dbname: string;
  username: string;
  password: string;
}

interface RawSecret {
  host?: string;
  hostname?: string;
  port?: number | string;
  dbname?: string;
  database?: string;
  username?: string;
  password?: string;
}

/**
 * Loads RDS credentials from Secrets Manager (ADR-011 Option B).
 * Returns null when DATABASE_SECRET_ARN is unset (local placeholder mode).
 */
export async function resolveDatabaseSecret(
  secretArn: string | undefined,
  region: string,
): Promise<RdsSecretFields | null> {
  if (!secretArn) {
    return null;
  }

  const client = new SecretsManagerClient({ region });
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!response.SecretString) {
    throw new Error(`Secret ${secretArn} has no SecretString`);
  }

  const raw = JSON.parse(response.SecretString) as RawSecret;
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  const port = Number(raw.port ?? 5432);

  if (!host || !dbname || !raw.username || !raw.password) {
    throw new Error("Database secret JSON missing host/dbname/username/password");
  }

  return {
    host,
    port,
    dbname,
    username: raw.username,
    password: raw.password,
  };
}

export function buildDatabaseUrl(fields: RdsSecretFields): string {
  const user = encodeURIComponent(fields.username);
  const pass = encodeURIComponent(fields.password);
  return `postgresql://${user}:${pass}@${fields.host}:${fields.port}/${fields.dbname}`;
}
