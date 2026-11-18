import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ForgeError } from "@forge/errors";
import type { AuthenticatedRequest } from "./principal.decorator.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";

/**
 * Ensures route :tenantId matches the authenticated principal tenant,
 * unless the principal is a platform admin.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const routeTenantId = request.params?.tenantId as string | undefined;
    if (!routeTenantId) {
      return true;
    }
    const principal = request.principal;
    if (!principal) {
      throw new ForgeError("UNAUTHORIZED", "Authentication required");
    }
    if (principal.isPlatformAdmin) {
      return true;
    }
    if (principal.tenantId !== routeTenantId) {
      throw new ForgeError("FORBIDDEN", "Tenant mismatch for authenticated principal");
    }
    return true;
  }
}
