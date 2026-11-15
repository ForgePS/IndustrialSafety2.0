import { sql, type SQLWrapper } from "drizzle-orm";

/**
 * Tenant-agnostic reads used only to resolve which tenant a request belongs to
 * (ADR-029). Each call is a SECURITY DEFINER function owned by the
 * `forge_identity_lookup` role, which holds SELECT-only policies on the routing
 * columns. The application role cannot read these tables outside its own tenant.
 */

export interface ResolvedIdentity {
  identityId: string;
  userId: string;
  tenantId: string;
  userStatus: string;
  sessionVersion: number;
  sessionsRevokedAt: Date | null;
}

export interface ResolvedInvitation {
  invitationId: string;
  tenantId: string;
  status: string;
  expiresAt: Date;
}

export interface ResolvedUserTenant {
  tenantId: string;
  tenantSlug: string;
  tenantDisplayName: string;
  tenantStatus: string;
  membershipId: string | null;
  membershipStatus: string;
  isDefaultTenant: boolean;
}

/** Minimal surface shared by `Database` and `DatabaseTransaction`. */
export interface IdentityLookupExecutor {
  // drizzle-orm execute return type varies by driver; callers normalize via asRows.
  execute(query: SQLWrapper): Promise<unknown>;
}

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }
  if (result && typeof result === "object" && "rows" in result) {
    return ((result as { rows: T[] }).rows ?? []) as T[];
  }
  return [];
}

function asDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function lookupIdentity(
  db: IdentityLookupExecutor,
  provider: string,
  subject: string,
): Promise<ResolvedIdentity | null> {
  const rows = asRows<{
    identity_id: string;
    user_id: string;
    tenant_id: string;
    user_status: string;
    session_version: number;
    sessions_revoked_at: Date | null;
  }>(await db.execute(sql`select * from forge_lookup_identity(${provider}, ${subject})`));

  const row = rows[0];
  return row
    ? {
        identityId: row.identity_id,
        userId: row.user_id,
        tenantId: row.tenant_id,
        userStatus: row.user_status,
        sessionVersion: Number(row.session_version),
        sessionsRevokedAt: asDate(row.sessions_revoked_at),
      }
    : null;
}

export async function lookupInvitation(
  db: IdentityLookupExecutor,
  tokenHash: string,
): Promise<ResolvedInvitation | null> {
  const rows = asRows<{
    invitation_id: string;
    tenant_id: string;
    status: string;
    expires_at: Date;
  }>(await db.execute(sql`select * from forge_lookup_invitation(${tokenHash})`));

  const row = rows[0];
  return row
    ? {
        invitationId: row.invitation_id,
        tenantId: row.tenant_id,
        status: row.status,
        expiresAt:
          row.expires_at instanceof Date ? row.expires_at : new Date(String(row.expires_at)),
      }
    : null;
}

export async function lookupUserTenants(
  db: IdentityLookupExecutor,
  userId: string,
): Promise<ResolvedUserTenant[]> {
  const rows = asRows<{
    tenant_id: string;
    tenant_slug: string;
    tenant_display_name: string;
    tenant_status: string;
    membership_id: string | null;
    membership_status: string;
    is_default_tenant: boolean;
  }>(await db.execute(sql`select * from forge_lookup_user_tenants(${userId}::uuid)`));

  return rows.map((row) => ({
    tenantId: row.tenant_id,
    tenantSlug: row.tenant_slug,
    tenantDisplayName: row.tenant_display_name,
    tenantStatus: row.tenant_status,
    membershipId: row.membership_id,
    membershipStatus: row.membership_status,
    isDefaultTenant: row.is_default_tenant,
  }));
}

export interface ResolvedCadConnection {
  connectionId: string;
  tenantId: string;
  adapterKey: string;
  adapterVersion: string;
  environment: string;
  transportType: string;
  status: string;
  intakeMode: string;
  configurationJson: Record<string, unknown>;
  mappingProfileId: string | null;
  credentialsSecretArn: string | null;
  webhookSecretArn: string | null;
  webhookKeyId: string | null;
  healthStatus: string;
}

/** Resolve CAD connection by public webhook id without tenant GUC (ADR-029). */
export async function lookupCadConnection(
  db: IdentityLookupExecutor,
  publicId: string,
): Promise<ResolvedCadConnection | null> {
  const rows = asRows<{
    connection_id: string;
    tenant_id: string;
    adapter_key: string;
    adapter_version: string;
    environment: string;
    transport_type: string;
    status: string;
    intake_mode: string;
    configuration_json: Record<string, unknown> | null;
    mapping_profile_id: string | null;
    credentials_secret_arn: string | null;
    webhook_secret_arn: string | null;
    webhook_key_id: string | null;
    health_status: string;
  }>(await db.execute(sql`select * from forge_lookup_cad_connection(${publicId})`));

  const row = rows[0];
  return row
    ? {
        connectionId: row.connection_id,
        tenantId: row.tenant_id,
        adapterKey: row.adapter_key,
        adapterVersion: row.adapter_version,
        environment: row.environment,
        transportType: row.transport_type,
        status: row.status,
        intakeMode: row.intake_mode,
        configurationJson: (row.configuration_json ?? {}) as Record<string, unknown>,
        mappingProfileId: row.mapping_profile_id,
        credentialsSecretArn: row.credentials_secret_arn,
        webhookSecretArn: row.webhook_secret_arn,
        webhookKeyId: row.webhook_key_id,
        healthStatus: row.health_status,
      }
    : null;
}

export interface ResolvedTenantDomain {
  domainId: string;
  tenantId: string;
  domain: string;
  domainType: string;
  verificationStatus: string;
}

/** Resolve tenant by verified vanity hostname without tenant GUC (ADR-029). */
export async function lookupTenantByDomain(
  db: IdentityLookupExecutor,
  domain: string,
): Promise<ResolvedTenantDomain | null> {
  const normalized = domain.trim().toLowerCase();
  if (!normalized) return null;
  const rows = asRows<{
    domain_id: string;
    tenant_id: string;
    domain: string;
    domain_type: string;
    verification_status: string;
  }>(await db.execute(sql`select * from forge_lookup_tenant_domain(${normalized})`));

  const row = rows[0];
  return row
    ? {
        domainId: row.domain_id,
        tenantId: row.tenant_id,
        domain: row.domain,
        domainType: row.domain_type,
        verificationStatus: row.verification_status,
      }
    : null;
}
