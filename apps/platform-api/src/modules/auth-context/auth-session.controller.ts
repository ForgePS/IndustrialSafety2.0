import { Body, Controller, Headers, Inject, Post, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import type { ForgeEnvironment } from "@forge/environment";
import { ForgeError } from "@forge/errors";
import { z } from "zod";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { APP_ENV } from "../../tokens.js";
import { Public } from "./public.decorator.js";
import {
  FORGE_CSRF_HEADER,
  buildClearSessionCookie,
  buildSessionSetCookie,
  corsRulesFromEnv,
  isTrustedBrowserOrigin,
  readSessionTokenFromCookieHeader,
  requestProtocolAndHost,
  sessionCookieName,
} from "./auth-session-cookie.js";
import { AuthSessionService, type AuthSessionTokens } from "./auth-session.service.js";
import {
  assertNoRefreshCredentialLeak,
  toPublicAuthSessionPayload,
} from "./auth-session.public-payload.js";

const oauthCallbackSchema = z.object({
  code: z.string().min(1).max(2048),
  codeVerifier: z.string().min(43).max(128),
  redirectUri: z.string().url().max(2048),
});

const passwordSchema = z.object({
  username: z.string().email().max(320),
  password: z.string().min(1).max(256),
});

const passwordChallengeSchema = z.object({
  username: z.string().email().max(320),
  session: z.string().min(1).max(4096),
  challengeName: z.string().min(1).max(64),
  newPassword: z.string().min(1).max(256).optional(),
  code: z.string().min(1).max(32).optional(),
  delivery: z.enum(["sms", "totp"]).optional(),
});

@Controller("api/v1/auth/session")
export class AuthSessionController {
  constructor(
    private readonly sessions: AuthSessionService,
    @Inject(APP_ENV) private readonly env: ForgeEnvironment,
  ) {}

  @Post("oauth/callback")
  @Public()
  async oauthCallback(
    @Body() body: unknown,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertTrustedOrigin(req);
    const parsed = oauthCallbackSchema.safeParse(body);
    if (!parsed.success) {
      throw new ForgeError("VALIDATION_FAILED", "Invalid OAuth callback payload");
    }

    const tokens = await this.sessions.exchangeOAuthCode(parsed.data);
    this.setSessionCookie(req, res, tokens);
    return ok(publicTokenPayload(tokens), getRequestIds(req));
  }

  @Post("password")
  @Public()
  async password(
    @Body() body: unknown,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertTrustedOrigin(req);
    const parsed = passwordSchema.safeParse(body);
    if (!parsed.success) {
      throw new ForgeError("VALIDATION_FAILED", "Email and password are required");
    }

    const result = await this.sessions.passwordAuthenticate(parsed.data);
    if (result.kind === "challenge") {
      return ok(
        {
          challenge: {
            kind:
              result.challengeName === "NEW_PASSWORD_REQUIRED"
                ? "new_password_required"
                : "mfa_required",
            session: result.session,
            username: result.username,
            ...(result.delivery ? { delivery: result.delivery } : {}),
          },
        },
        getRequestIds(req),
      );
    }

    this.setSessionCookie(req, res, result.tokens);
    return ok(publicTokenPayload(result.tokens), getRequestIds(req));
  }

  @Post("password/challenge")
  @Public()
  async passwordChallenge(
    @Body() body: unknown,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertTrustedOrigin(req);
    const parsed = passwordChallengeSchema.safeParse(body);
    if (!parsed.success) {
      throw new ForgeError("VALIDATION_FAILED", "Invalid password challenge payload");
    }

    const responses: Record<string, string> = {};
    if (parsed.data.challengeName === "NEW_PASSWORD_REQUIRED") {
      if (!parsed.data.newPassword) {
        throw new ForgeError("VALIDATION_FAILED", "New password is required");
      }
      responses.NEW_PASSWORD = parsed.data.newPassword;
    } else if (
      parsed.data.challengeName === "SMS_MFA" ||
      parsed.data.challengeName === "SOFTWARE_TOKEN_MFA"
    ) {
      if (!parsed.data.code) {
        throw new ForgeError("VALIDATION_FAILED", "MFA code is required");
      }
      const codeKey =
        parsed.data.challengeName === "SMS_MFA" ? "SMS_MFA_CODE" : "SOFTWARE_TOKEN_MFA_CODE";
      responses[codeKey] = parsed.data.code;
    } else {
      throw new ForgeError("VALIDATION_FAILED", "Unsupported challenge");
    }

    const result = await this.sessions.passwordChallenge({
      username: parsed.data.username,
      session: parsed.data.session,
      challengeName: parsed.data.challengeName,
      responses,
    });

    if (result.kind === "challenge") {
      return ok(
        {
          challenge: {
            kind:
              result.challengeName === "NEW_PASSWORD_REQUIRED"
                ? "new_password_required"
                : "mfa_required",
            session: result.session,
            username: result.username,
            ...(result.delivery ? { delivery: result.delivery } : {}),
          },
        },
        getRequestIds(req),
      );
    }

    this.setSessionCookie(req, res, result.tokens);
    return ok(publicTokenPayload(result.tokens), getRequestIds(req));
  }

  @Post("refresh")
  @Public()
  async refresh(
    @Req() req: RequestWithIds,
    @Headers(FORGE_CSRF_HEADER) csrf: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertTrustedOrigin(req);
    const raw = this.requireSessionCookie(req);
    await this.sessions.assertCsrf(raw, csrf);
    const tokens = await this.sessions.refreshSession(raw);
    this.setSessionCookie(req, res, tokens);
    return ok(publicTokenPayload(tokens), getRequestIds(req));
  }

  @Post("logout")
  @Public()
  async logout(
    @Req() req: RequestWithIds,
    @Headers(FORGE_CSRF_HEADER) csrf: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertTrustedOrigin(req);
    const hints = requestProtocolAndHost(req);
    const raw = readSessionTokenFromCookieHeader(
      typeof req.headers.cookie === "string" ? req.headers.cookie : undefined,
      hints,
    );
    if (raw) {
      try {
        await this.sessions.assertCsrf(raw, csrf);
      } catch {
        // Still clear cookie on CSRF failure to reduce sticky sessions.
      }
      await this.sessions.logoutSession(raw);
    }

    const cookieName = sessionCookieName(hints);
    res.setHeader(
      "Set-Cookie",
      buildClearSessionCookie({
        cookieName,
        secure: hints.protocol === "https",
      }),
    );
    return ok({ loggedOut: true }, getRequestIds(req));
  }

  private assertTrustedOrigin(req: RequestWithIds): void {
    const hints = requestProtocolAndHost(req);
    const trusted = isTrustedBrowserOrigin({
      origin: headerString(req.headers.origin),
      referer: headerString(req.headers.referer),
      requestHost: hints.host,
      requestProtocol: hints.protocol,
      rules: corsRulesFromEnv(this.env),
      appEnv: this.env.APP_ENV,
    });
    if (!trusted) {
      throw new ForgeError("FORBIDDEN", "Untrusted request origin");
    }
  }

  private requireSessionCookie(req: RequestWithIds): string {
    const hints = requestProtocolAndHost(req);
    const raw = readSessionTokenFromCookieHeader(
      typeof req.headers.cookie === "string" ? req.headers.cookie : undefined,
      hints,
    );
    if (!raw) {
      throw new ForgeError("UNAUTHORIZED", "Missing session cookie");
    }
    return raw;
  }

  private setSessionCookie(
    req: RequestWithIds,
    res: Response,
    tokens: AuthSessionTokens,
  ): void {
    const hints = requestProtocolAndHost(req);
    const cookieName = sessionCookieName(hints);
    res.setHeader(
      "Set-Cookie",
      buildSessionSetCookie(tokens.rawSessionToken, {
        cookieName,
        maxAgeSeconds: tokens.maxAgeSeconds,
        secure: hints.protocol === "https",
      }),
    );
  }
}

function publicTokenPayload(tokens: AuthSessionTokens) {
  const payload = toPublicAuthSessionPayload(tokens);
  assertNoRefreshCredentialLeak(payload);
  return payload;
}

function headerString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
