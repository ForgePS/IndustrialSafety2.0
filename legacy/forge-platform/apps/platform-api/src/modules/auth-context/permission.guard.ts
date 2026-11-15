import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { evaluateAuthorization } from "@forge/authorization";
import { ForgeError } from "@forge/errors";
import { AuthContextService } from "./auth-context.service.js";
import { AuthorizationDecisionService } from "./authorization-decision.service.js";
import type { AuthenticatedRequest } from "./principal.decorator.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";
import {
  REQUIRE_PERMISSION_KEY,
  type RequirePermissionMeta,
} from "./require-permission.decorator.js";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authContext: AuthContextService,
    private readonly decisions: AuthorizationDecisionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const meta = this.reflector.getAllAndOverride<RequirePermissionMeta | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!meta) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.principal;
    if (!principal) {
      throw new ForgeError("UNAUTHORIZED", "Authentication required");
    }

    const resourceTenantId = (request.params?.tenantId as string | undefined) ?? principal.tenantId;
    const resourceOrganizationId = (request.params?.organizationId as string | undefined) ?? null;

    const operational = await this.authContext.getTenantOperationalState(resourceTenantId);
    const permissionCodes =
      meta.anyOf && meta.anyOf.length > 0
        ? meta.anyOf
        : meta.permissionCode
          ? [meta.permissionCode]
          : [];
    if (permissionCodes.length === 0) {
      return true;
    }

    let lastDenied: { reasonCode: string; permission: string } | null = null;
    for (const permissionCode of permissionCodes) {
      const decision = evaluateAuthorization({
        principal,
        permissionCode,
        resourceType: meta.resourceType ?? "platform",
        resourceTenantId,
        resourceOrganizationId,
        tenantOperationalState: operational,
        roleEffects: [{ effect: "ALLOW", organizationId: null }],
        ...(meta.requiresEntitlement ? { requiresEntitlement: meta.requiresEntitlement } : {}),
        allowWhenSuspended: meta.allowWhenSuspended ?? permissionCode.startsWith("platform.tenant"),
      });
      if (decision.allowed) {
        return true;
      }
      lastDenied = { reasonCode: decision.reasonCode, permission: permissionCode };
    }

    if (lastDenied) {
      await this.decisions.recordDenial({
        tenantId: resourceTenantId,
        userId: principal.userId,
        permissionCode: lastDenied.permission,
        resourceType: meta.resourceType ?? "platform",
        reasonCode: lastDenied.reasonCode,
        correlationId: principal.correlationId,
        context: {
          anyOf: permissionCodes,
        },
      });
    }

    throw new ForgeError("FORBIDDEN", "You do not have permission to perform this action.", {
      details: [
        {
          reasonCode: lastDenied?.reasonCode ?? "PERMISSION_DENIED",
          permission: permissionCodes.join(" | "),
        },
      ],
    });
  }
}
