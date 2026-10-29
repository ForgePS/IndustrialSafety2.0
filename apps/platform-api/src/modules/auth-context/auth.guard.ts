import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ForgeError, isForgeError } from "@forge/errors";
import { AuthContextService } from "./auth-context.service.js";
import type { AuthenticatedRequest } from "./principal.decorator.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authContext: AuthContextService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    try {
      request.principal = await this.authContext.resolvePrincipal(request);
    } catch (error) {
      if (isForgeError(error)) {
        throw error;
      }
      const detail = error instanceof Error ? error.message : "Unexpected auth error";
      throw new ForgeError("UNAUTHORIZED", `Authentication failed: ${detail}`, { cause: error });
    }
    return true;
  }
}
