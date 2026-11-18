import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { RequestWithIds } from "../../common/request-ids.js";

export type AuthenticatedRequest = RequestWithIds & {
  principal?: ForgePrincipal;
};

export const Principal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ForgePrincipal => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.principal) {
      throw new Error("Principal missing on request");
    }
    return request.principal;
  },
);
