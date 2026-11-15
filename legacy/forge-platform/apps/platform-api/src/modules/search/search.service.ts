import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import {
  SEARCH_GROUP_LABELS,
  searchQuerySchema,
  type SearchEntityType,
  type SearchGroup,
  type SearchHit,
  type SearchResponse,
} from "@forge/contracts";
import {
  facilities,
  platformModules,
  tenants,
  userTenantMemberships,
  users,
  withTenantTransaction,
  type Database,
} from "@forge/database";
import { hasPermission, type ForgePrincipal } from "@forge/tenant-context";
import { and, eq, ilike, or } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";

function wants(types: SearchEntityType[] | undefined, type: SearchEntityType): boolean {
  return !types || types.length === 0 || types.includes(type);
}

@Injectable()
export class SearchService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async search(
    tenantId: string,
    rawQuery: unknown,
    principal: ForgePrincipal,
  ): Promise<SearchResponse> {
    if (!principal.isPlatformAdmin && principal.tenantId !== tenantId) {
      throw new ForbiddenException("Tenant scope mismatch");
    }
    const query = searchQuerySchema.parse(rawQuery);
    const q = query.q;
    const limit = query.limitPerType;
    const types = query.types;

    const groups: SearchGroup[] = [];

    if (wants(types, "tenant") && this.can(principal, "platform.tenant.read")) {
      const hits = await this.searchTenants(q, limit);
      groups.push({ type: "tenant", label: SEARCH_GROUP_LABELS.tenant, hits });
    }

    if (wants(types, "membership") && this.can(principal, "platform.membership.read")) {
      const hits = await this.searchMemberships(tenantId, q, limit);
      groups.push({ type: "membership", label: SEARCH_GROUP_LABELS.membership, hits });
    }

    if (wants(types, "facility") && this.can(principal, "tenant.facilities.read")) {
      const hits = await this.searchFacilities(tenantId, q, limit);
      groups.push({ type: "facility", label: SEARCH_GROUP_LABELS.facility, hits });
    }

    if (wants(types, "module") && this.can(principal, "platform.entitlement.manage")) {
      const hits = await this.searchModules(q, limit);
      groups.push({ type: "module", label: SEARCH_GROUP_LABELS.module, hits });
    }

    // Authz-before-map: empty groups for denied providers are omitted (never tease locked hits).
    return { groups: groups.filter((g) => g.hits.length > 0) };
  }

  private can(principal: ForgePrincipal, code: string): boolean {
    return hasPermission(principal, code);
  }

  private async searchTenants(q: string, limit: number): Promise<SearchHit[]> {
    const rows = await this.db
      .select({
        id: tenants.id,
        displayName: tenants.displayName,
        slug: tenants.slug,
        status: tenants.status,
      })
      .from(tenants)
      .where(
        or(
          ilike(tenants.displayName, `%${q}%`),
          ilike(tenants.slug, `%${q}%`),
          ilike(tenants.legalName, `%${q}%`),
        ),
      )
      .limit(limit);

    return rows.map((row) => ({
      type: "tenant" as const,
      id: row.id,
      title: row.displayName,
      subtitle: `${row.slug} · ${row.status}`,
      href: `/tenant-detail?tenantId=${encodeURIComponent(row.id)}`,
      tenantId: row.id,
    }));
  }

  private async searchMemberships(
    tenantId: string,
    q: string,
    limit: number,
  ): Promise<SearchHit[]> {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: userTenantMemberships.id,
          userId: userTenantMemberships.userId,
          status: userTenantMemberships.status,
          email: users.primaryEmail,
        })
        .from(userTenantMemberships)
        .innerJoin(users, eq(users.id, userTenantMemberships.userId))
        .where(
          and(eq(userTenantMemberships.tenantId, tenantId), ilike(users.primaryEmail, `%${q}%`)),
        )
        .orderBy(users.primaryEmail)
        .limit(limit);

      return rows.map((row) => ({
        type: "membership" as const,
        id: row.id,
        title: row.email,
        subtitle: row.status,
        href: `/members?tenantId=${encodeURIComponent(tenantId)}`,
        tenantId,
      }));
    });
  }

  private async searchFacilities(tenantId: string, q: string, limit: number): Promise<SearchHit[]> {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: facilities.id,
          name: facilities.name,
          facilityKey: facilities.facilityKey,
          status: facilities.status,
        })
        .from(facilities)
        .where(
          and(
            eq(facilities.tenantId, tenantId),
            or(
              ilike(facilities.name, `%${q}%`),
              ilike(facilities.facilityKey, `%${q}%`),
              ilike(facilities.city, `%${q}%`),
            ),
          ),
        )
        .orderBy(facilities.name)
        .limit(limit);

      return rows.map((row) => ({
        type: "facility" as const,
        id: row.id,
        title: row.name,
        subtitle: `${row.facilityKey} · ${row.status}`,
        href: `/facilities?tenantId=${encodeURIComponent(tenantId)}`,
        tenantId,
      }));
    });
  }

  private async searchModules(q: string, limit: number): Promise<SearchHit[]> {
    const rows = await this.db
      .select({
        id: platformModules.id,
        code: platformModules.code,
        name: platformModules.name,
        status: platformModules.status,
      })
      .from(platformModules)
      .where(
        and(
          eq(platformModules.status, "ACTIVE"),
          or(ilike(platformModules.code, `%${q}%`), ilike(platformModules.name, `%${q}%`)),
        ),
      )
      .orderBy(platformModules.code)
      .limit(limit);

    return rows.map((row) => ({
      type: "module" as const,
      id: row.id,
      title: row.name,
      subtitle: row.code,
      href: `/modules`,
    }));
  }
}
