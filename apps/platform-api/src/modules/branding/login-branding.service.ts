import { Inject, Injectable } from "@nestjs/common";
import { DEFAULT_LOGIN_BRANDING, resolveLoginBranding } from "@forge/configuration";
import { lookupTenantByDomain, type Database } from "@forge/database";
import { ForgeError } from "@forge/errors";
import { DATABASE } from "../../tokens.js";
import { ConfigurationService } from "../configuration/configuration.service.js";
import {
  publicLoginBrandingSchema,
  type PublicLoginBrandingDto,
} from "./login-branding.public-schema.js";

/** @deprecated Prefer PublicLoginBrandingDto — kept as alias for call sites. */
export type PublicLoginBranding = PublicLoginBrandingDto;

const PRODUCERS_LOGO_PATH = "/branding/producers-rice-mill.png";
const PRODUCERS_BRAND_LABEL = "Producers Rice Mill";
const PRODUCERS_HEADLINE = "Welcome to Producers Rice Mill";

function normalizeHost(raw: string): string {
  let host = raw.trim().toLowerCase();
  try {
    if (host.includes("://")) {
      host = new URL(host).hostname;
    }
  } catch {
    // keep trimmed value
  }
  const slash = host.indexOf("/");
  if (slash >= 0) host = host.slice(0, slash);
  const colon = host.indexOf(":");
  if (colon >= 0) host = host.slice(0, colon);
  return host;
}

function isProducersHost(host: string): boolean {
  return (
    host === "producersrice.forgepublicsafety.com" ||
    host === "producers-rice-mill.forgepublicsafety.com"
  );
}

function applyProducersBundled(
  host: string,
  login: ReturnType<typeof resolveLoginBranding>,
  logoUrl?: string,
): { login: ReturnType<typeof resolveLoginBranding>; logoUrl?: string } {
  if (!isProducersHost(host)) {
    return { login, ...(logoUrl ? { logoUrl } : {}) };
  }

  const bundledLogo = PRODUCERS_LOGO_PATH;
  const resolvedLogo = login.logoUrl.trim() || logoUrl?.trim() || bundledLogo;
  const brandLabel =
    login.brandLabel === DEFAULT_LOGIN_BRANDING.brandLabel ||
    login.brandLabel === "Forge Industrial"
      ? PRODUCERS_BRAND_LABEL
      : login.brandLabel;
  const headline =
    login.headline === DEFAULT_LOGIN_BRANDING.headline ||
    login.headline.startsWith("Welcome to Forge")
      ? PRODUCERS_HEADLINE
      : login.headline;

  return {
    logoUrl: resolvedLogo,
    login: {
      ...login,
      logoUrl: resolvedLogo,
      brandLabel,
      headline,
      statusText: "",
    },
  };
}

@Injectable()
export class LoginBrandingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly configuration: ConfigurationService,
  ) {}

  async byHost(rawHost: string | undefined): Promise<PublicLoginBrandingDto> {
    const host = rawHost ? normalizeHost(rawHost) : "";
    if (!host) {
      throw new ForgeError("VALIDATION_FAILED", "host query parameter is required");
    }

    // Tenant UUID stays server-side — never returned on this unauthenticated path (FIS-L01).
    const resolved = await lookupTenantByDomain(this.db, host);
    if (!resolved) {
      throw new ForgeError("NOT_FOUND", "No verified tenant domain for host");
    }

    const effective = await this.configuration.effectivePublished(
      resolved.tenantId,
      "branding",
      "default",
    );
    const payload =
      effective.payload && typeof effective.payload === "object"
        ? (effective.payload as Record<string, unknown>)
        : {};

    let logoUrl =
      typeof payload.logoUrl === "string" && payload.logoUrl.trim()
        ? payload.logoUrl.trim()
        : undefined;
    const primaryColor =
      typeof payload.primaryColor === "string" && payload.primaryColor.trim()
        ? payload.primaryColor.trim()
        : undefined;

    let login = resolveLoginBranding(payload as Parameters<typeof resolveLoginBranding>[0]);
    const bundled = applyProducersBundled(host, login, logoUrl);
    login = bundled.login;
    logoUrl = bundled.logoUrl;

    const dto = {
      host,
      displayName: login.brandLabel,
      brandLabel: login.brandLabel,
      ...(logoUrl ? { logoUrl } : {}),
      ...(primaryColor ? { primaryColor } : {}),
      login,
    };

    return publicLoginBrandingSchema.parse(dto);
  }
}
