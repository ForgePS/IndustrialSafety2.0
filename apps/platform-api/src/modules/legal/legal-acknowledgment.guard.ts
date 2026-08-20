import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ForgeError } from "@forge/errors";
import type { AuthenticatedRequest } from "../auth-context/principal.decorator.js";
import { AcknowledgmentService } from "./acknowledgment.service.js";

const ALLOW_PREFIXES = [
  "/api/v1/auth/",
  "/api/v1/legal/",
  "/api/v1/health",
  "/health",
];

@Injectable()
export class LegalAcknowledgmentGuard implements CanActivate {
  constructor(private readonly acknowledgments: AcknowledgmentService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const path = String(request.originalUrl ?? request.url ?? "").split("?")[0] ?? "";
    if (!path.startsWith("/api/v1/industrial")) {
      return true;
    }
    if (ALLOW_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))) {
      return true;
    }
    const principal = request.principal;
    if (!principal?.tenantId || !principal.userId) {
      return true;
    }
    if (!principal.activeProducts?.has("FORGE_INDUSTRIAL")) {
      return true;
    }
    const gateOn = await this.acknowledgments.isLoginGateEnabled(
      principal.tenantId,
      principal,
    );
    if (!gateOn) return true;
    const summary = await this.acknowledgments.summaryForMe(principal.tenantId, principal);
    if (summary.status === "REQUIRED") {
      throw new ForgeError(
        "LEGAL_ACKNOWLEDGMENT_REQUIRED",
        "Required legal acknowledgments must be accepted before continuing",
        {
          details: [
            {
              pendingCount: summary.pendingCount,
              gatePath: summary.gatePath,
            },
          ],
        },
      );
    }
    return true;
  }
}
