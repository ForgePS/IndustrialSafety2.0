import { Body, Controller, Post, Req } from "@nestjs/common";
import { ForgeError } from "@forge/errors";
import { z } from "zod";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { CognitoAdminService } from "../cognito/cognito-admin.service.js";
import { Public } from "./public.decorator.js";

const forgotSchema = z.object({
  email: z.string().email().max(320),
});

/**
 * Public password recovery. Uses AdminResetUserPassword server-side so browser
 * clients do not depend on Cognito IdP CORS for ForgotPassword.
 */
@Controller("api/v1/auth")
export class AuthPasswordController {
  constructor(private readonly cognito: CognitoAdminService) {}

  @Post("forgot-password")
  @Public()
  async forgotPassword(@Body() body: unknown, @Req() req: RequestWithIds) {
    const parsed = forgotSchema.safeParse(body);
    if (!parsed.success) {
      throw new ForgeError("VALIDATION_FAILED", "Enter a valid email address.");
    }
    const email = parsed.data.email.trim().toLowerCase();

    try {
      await this.cognito.resetPassword(email);
    } catch (error) {
      if (error instanceof ForgeError) {
        if (error.code === "NOT_FOUND" || error.code === "CONFLICT") {
          // Do not reveal whether the account exists or can self-reset.
        } else if (error.code === "RATE_LIMITED") {
          throw error;
        }
      } else {
        throw error;
      }
    }

    return ok(
      {
        sent: true,
        message:
          "If an account exists for that email, a reset message has been sent. Check your inbox for a link and verification code.",
      },
      getRequestIds(req),
    );
  }
}
