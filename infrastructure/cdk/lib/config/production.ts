import type { ForgeEnvironmentConfig } from "./environment-schema.js";
import { validateEnvironmentConfig } from "./environment-schema.js";
import { productionCostProfile } from "./cost-profile.js";
import { PRODUCTION_PRE_CUTOVER_SPA_ORIGINS } from "./production-spa-origins.js";

const { knobs } = productionCostProfile;

/**
 * Approved commercial production AWS account (same account hosts Development today).
 * Must always be supplied via FORGE_PRODUCTION_ACCOUNT — no silent placeholders.
 */
export const APPROVED_PRODUCTION_ACCOUNT = "511343547817";

const PRODUCTION_ROOT_DOMAIN = "forgepublicsafety.com";

function requireProductionAccount(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.FORGE_PRODUCTION_ACCOUNT?.trim();
  if (!raw) {
    throw new Error(
      "FORGE_PRODUCTION_ACCOUNT is required for production configuration (fail-closed; no 000000000000 fallback)",
    );
  }
  if (!/^\d{12}$/.test(raw) || raw === "000000000000") {
    throw new Error(
      `FORGE_PRODUCTION_ACCOUNT must be a real 12-digit AWS account ID (received invalid value)`,
    );
  }
  if (raw !== APPROVED_PRODUCTION_ACCOUNT) {
    throw new Error(
      `FORGE_PRODUCTION_ACCOUNT ${raw} is not the approved production account ${APPROVED_PRODUCTION_ACCOUNT}`,
    );
  }
  return raw;
}

function productionHttpsHost(role: string): string {
  return `https://${role}.${PRODUCTION_ROOT_DOMAIN}`;
}

const PRODUCERS_VANITY_HTTPS = [
  "https://producersrice.forgeindustrialsafety.com",
  "https://producersrice.forgepublicsafety.com",
  "https://producers-rice-mill.forgepublicsafety.com",
] as const;

/**
 * Production commercial baseline — Production cost profile (sized by workload).
 * Domains are HTTPS-ready Cognito/callback targets; DNS cutover is NOT performed in PROD-S0R.
 */
export function createProductionConfig(
  env: NodeJS.ProcessEnv = process.env,
): ForgeEnvironmentConfig {
  const account = requireProductionAccount(env);

  const academy = `${productionHttpsHost("academy")}`;
  const rms = `${productionHttpsHost("rms")}`;
  const creator = `${productionHttpsHost("creator")}`;
  const admin = `${productionHttpsHost("admin")}`;
  const industrial = `${productionHttpsHost("industrial")}`;
  const api = `${productionHttpsHost("api")}`;

  return validateEnvironmentConfig({
    environmentName: "production",
    costProfile: "production",
    partition: "aws",
    account,
    region: "us-east-1",
    secondaryRegion: "us-west-2",
    projectName: "forge-platform",
    networking: {
      vpcCidr: "10.50.0.0/16",
      ...knobs.networking,
    },
    database: {
      engineVersion: "15.10",
      ...knobs.database,
    },
    retention: knobs.retention,
    compute: knobs.compute,
    features: knobs.features,
    domains: {
      academy: `academy.${PRODUCTION_ROOT_DOMAIN}`,
      rms: `rms.${PRODUCTION_ROOT_DOMAIN}`,
      creator: `creator.${PRODUCTION_ROOT_DOMAIN}`,
      api: `api.${PRODUCTION_ROOT_DOMAIN}`,
      industrial: `industrial.${PRODUCTION_ROOT_DOMAIN}`,
      tenantAdmin: `admin.${PRODUCTION_ROOT_DOMAIN}`,
      ses: `mail.${PRODUCTION_ROOT_DOMAIN}`,
    },
    // TLS enabled for production ALB HTTPS listener using the ISSUED ACM cert.
    // Custom hostnames are configured on CloudFront/ALB infrastructure without
    // changing external customer DNS (cutover remains unauthorized).
    edge: {
      enableHttps: true,
      apiHostname: `api.${PRODUCTION_ROOT_DOMAIN}`,
      consoleHostname: `creator.${PRODUCTION_ROOT_DOMAIN}`,
      certificateArn:
        "arn:aws:acm:us-east-1:511343547817:certificate/ca267baa-304e-4ffd-be51-7350abab0c3f",
    },
    cognito: {
      callbackUrls: [
        `${academy}/api/auth/callback`,
        `${rms}/auth/callback/`,
        `${creator}/auth/callback/`,
        `${admin}/auth/callback/`,
        `${industrial}/auth/callback/`,
        ...PRODUCERS_VANITY_HTTPS.map((origin) => `${origin}/auth/callback/`),
        ...PRODUCTION_PRE_CUTOVER_SPA_ORIGINS.map((origin) => `${origin}/auth/callback/`),
      ],
      logoutUrls: [
        `${academy}/`,
        `${rms}/`,
        `${creator}/`,
        `${admin}/`,
        `${industrial}/`,
        `${api}/`,
        ...PRODUCERS_VANITY_HTTPS.map((origin) => `${origin}/`),
        ...PRODUCTION_PRE_CUTOVER_SPA_ORIGINS.map((origin) => `${origin}/`),
      ],
      selfSignUpEnabled: false,
    },
  });
}

/** Lazily validated export — resolves when the module loads (tests must set FORGE_PRODUCTION_ACCOUNT). */
export const productionConfig: ForgeEnvironmentConfig = createProductionConfig();
