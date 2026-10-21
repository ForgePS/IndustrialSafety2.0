import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { z } from "zod";
import { ok } from "../../common/api-response.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { Public } from "../auth-context/public.decorator.js";
import {
  RequireAnyPermission,
  RequirePermission,
} from "../auth-context/require-permission.decorator.js";
import { InvitationsService } from "./invitations.service.js";

const revokeSchema = z.object({ reason: z.string().min(1).max(2000) });

const INVITE_MANAGE = ["platform.invitation.manage", "platform.user.invite"] as const;

@Controller("api/v1/auth/invitations")
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  @RequireAnyPermission([...INVITE_MANAGE])
  @Idempotent({ resourceType: "user_invitation" })
  async create(
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.invitations.create(body, principal), getRequestIds(req));
  }

  /** Static path must be registered before `:invitationId` routes. */
  @Post("accept")
  @Public()
  async accept(@Body() body: unknown, @Req() req: RequestWithIds) {
    return ok(await this.invitations.accept(body, getRequestIds(req)), getRequestIds(req));
  }

  @Get()
  @RequirePermission("platform.invitation.read")
  async list(
    @Query("tenantId") tenantId: string | undefined,
    @Query("status") status: string | undefined,
    @Query("email") email: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const resolvedTenantId = resolveTenantId(tenantId, principal);
    const data = await this.invitations.list(resolvedTenantId, { status, email });
    return ok(data.map(stripHash), getRequestIds(req), {
      page: 1,
      pageSize: data.length,
      total: data.length,
    });
  }

  @Get(":invitationId")
  @RequirePermission("platform.invitation.read")
  async get(
    @Param("invitationId") invitationId: string,
    @Query("tenantId") tenantId: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const resolvedTenantId = resolveTenantId(tenantId, principal);
    const data = await this.invitations.get(resolvedTenantId, invitationId);
    return ok(stripHash(data), getRequestIds(req));
  }

  @Post(":invitationId/resend")
  @RequireAnyPermission([...INVITE_MANAGE])
  async resend(
    @Param("invitationId") invitationId: string,
    @Query("tenantId") tenantId: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const resolvedTenantId = resolveTenantId(tenantId, principal);
    return ok(
      await this.invitations.resend(resolvedTenantId, invitationId, principal),
      getRequestIds(req),
    );
  }

  @Post(":invitationId/revoke")
  @RequireAnyPermission([...INVITE_MANAGE])
  async revoke(
    @Param("invitationId") invitationId: string,
    @Query("tenantId") tenantId: string | undefined,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const resolvedTenantId = resolveTenantId(tenantId, principal);
    const { reason } = revokeSchema.parse(body);
    return ok(
      await this.invitations.revoke(resolvedTenantId, invitationId, reason, principal),
      getRequestIds(req),
    );
  }
}

function resolveTenantId(tenantId: string | undefined, principal: ForgePrincipal): string {
  if (tenantId) {
    if (!principal.isPlatformAdmin && principal.tenantId !== tenantId) {
      throw new ForgeError("FORBIDDEN", "Cannot read invitations for another tenant");
    }
    return tenantId;
  }
  return principal.tenantId;
}

function stripHash<T extends { invitationTokenHash?: string }>(row: T) {
  const { invitationTokenHash: _hash, ...rest } = row;
  return rest;
}
