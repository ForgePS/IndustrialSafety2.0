#!/usr/bin/env node
/**
 * Build a static-export Forge app, sync to S3, and invalidate CloudFront.
 *
 * Usage:
 *   node scripts/sync-static-site.mjs --app console
 *   node scripts/sync-static-site.mjs --app rms
 *   node scripts/sync-static-site.mjs --app industrial
 *   node scripts/sync-static-site.mjs --app field
 *   node scripts/sync-static-site.mjs --app rms --skip-build
 *   node scripts/sync-static-site.mjs --app industrial --full-invalidate
 *
 * Cache strategy (pairs with ForgeStaticHosting):
 *   - `_next/static/*` → Cache-Control: public,max-age=31536000,immutable
 *   - HTML / other     → Cache-Control: public,max-age=0,must-revalidate
 *   - Default invalidation covers entry shells only (hashed chunks are immutable).
 *   - Pass --full-invalidate for a one-shot /* bust (e.g. before CDN cache policies deploy).
 *
 * Environment (optional — resolved from CloudFormation exports when omitted):
 *   FORGE_ENVIRONMENT          default: development
 *   FORGE_{APP}_BUCKET         S3 bucket name
 *   FORGE_{APP}_DISTRIBUTION_ID CloudFront distribution ID
 *   AWS_PROFILE / AWS_REGION
 *
 * RMS / Industrial build env (resolved when not already set):
 *   NEXT_PUBLIC_API_URL        from ForgeCompute-ApiHttpsDomain (https://{domain})
 *   NEXT_PUBLIC_APP_URL        from ForgeFrontend-{App}Domain (https://{domain})
 *   NEXT_PUBLIC_COGNITO_DOMAIN from ForgeIdentity-CognitoDomain or FORGE_COGNITO_DOMAIN
 *   NEXT_PUBLIC_COGNITO_CLIENT_ID from ForgeIdentity-{App}ClientId or FORGE_*_COGNITO_CLIENT_ID
 *   NEXT_PUBLIC_COGNITO_USER_POOL_ID from ForgeIdentity-UserPoolId
 *
 * Deployed builds must NOT set NEXT_PUBLIC_ALLOW_DEV_PRINCIPAL.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

const APPS = {
  console: {
    packageName: "@forge/creator-console",
    outDir: "apps/creator-console/out",
    stackExportPrefix: "ForgeFrontend-Console",
  },
  rms: {
    packageName: "@forge/rms-web",
    outDir: "apps/rms-web/out",
    stackExportPrefix: "ForgeFrontend-Rms",
  },
  tenantadmin: {
    packageName: "@forge/tenant-admin",
    outDir: "apps/tenant-admin/out",
    stackExportPrefix: "ForgeFrontend-TenantAdmin",
  },
  industrial: {
    packageName: "@forge/industrial-web",
    outDir: "apps/industrial-web/out",
    stackExportPrefix: "ForgeFrontend-Industrial",
  },
  field: {
    packageName: "@forge/field-web",
    outDir: "apps/field-web/out",
    stackExportPrefix: "ForgeFrontend-Field",
  },
};

function parseArgs(argv) {
  let app = null;
  let skipBuild = false;
  let fullInvalidate = false;
  let environment = process.env.FORGE_ENVIRONMENT || "development";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--app") {
      app = argv[i + 1];
      i += 1;
    } else if (arg === "--environment") {
      environment = argv[i + 1];
      i += 1;
    } else if (arg === "--skip-build") {
      skipBuild = true;
    } else if (arg === "--full-invalidate") {
      fullInvalidate = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        `Usage: node scripts/sync-static-site.mjs --app console|rms|tenantadmin|industrial|field [--environment development] [--skip-build] [--full-invalidate]`,
      );
      process.exit(0);
    }
  }

  if (!app || !APPS[app]) {
    console.error("Required: --app console|rms|tenantadmin|industrial|field");
    process.exit(1);
  }

  return { app, skipBuild, environment, fullInvalidate };
}

function run(command, args, options = {}) {
  const env = options.env ? { ...process.env, ...options.env } : process.env;
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
    env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const NEXT_PUBLIC_BUILD_KEYS = [
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_APP_ENV",
  "NEXT_PUBLIC_COGNITO_USER_POOL_ID",
  "NEXT_PUBLIC_COGNITO_CLIENT_ID",
  "NEXT_PUBLIC_COGNITO_DOMAIN",
];

/** Next.js only bakes NEXT_PUBLIC_* when present at build time — write a local prod env file. */
function writeNextProductionEnv(appRoot, buildEnv) {
  // Keep explicit empty values (same-origin API URL) so .env.local cannot refill them.
  const lines = NEXT_PUBLIC_BUILD_KEYS.filter(
    (key) => buildEnv[key] !== undefined && buildEnv[key] !== null,
  ).map((key) => `${key}=${String(buildEnv[key]).trim()}`);
  if (lines.length === 0) return null;
  const file = path.join(appRoot, ".env.production.local");
  writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
  return file;
}

function removeFileIfExists(filePath) {
  if (!filePath) return;
  try {
    unlinkSync(filePath);
  } catch {
    // ignore missing file
  }
}

function resolveProvenanceBuildEnv(app, environment) {
  if (app === "rms") return resolveRmsBuildEnv(environment);
  if (app === "industrial") return resolveIndustrialBuildEnv(environment);
  if (app === "field") return resolveFieldBuildEnv(environment);
  if (app === "tenantadmin") return resolveTenantAdminBuildEnv(environment);
  if (app === "console") return resolveConsoleBuildEnv(environment);
  return null;
}

function resolveExport(exportName) {
  // Prefer shell:false so JMESPath single quotes are not mangled by cmd.exe on Windows.
  const result = spawnSync(
    "aws",
    [
      "cloudformation",
      "list-exports",
      "--query",
      `Exports[?Name==\`${exportName}\`].Value | [0]`,
      "--output",
      "text",
    ],
    { encoding: "utf8", env: process.env, shell: false },
  );
  if (result.status !== 0) {
    console.error(`Failed to resolve CloudFormation export ${exportName}`);
    if (result.stderr) console.error(result.stderr);
    process.exit(result.status ?? 1);
  }
  // AWS CLI on Windows can append a trailing "None" line / CR; keep the first token only.
  const value = (result.stdout || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && line !== "None");
  if (!value) {
    return null;
  }
  return value;
}

/**
 * Production stacks prefix export names (Forge-Production-Frontend:ForgeFrontend-…).
 * Never fall back to unprefixed Development exports when targeting production.
 */
function productionExportName(environment, bareName) {
  if (environment !== "production" && environment !== "govcloud-production") {
    return bareName;
  }
  const prefix =
    environment === "govcloud-production" ? "Forge-Govcloud-Production" : "Forge-Production";
  if (bareName.startsWith("ForgeFrontend-Field")) {
    return `${prefix}-FieldFrontend:${bareName}`;
  }
  if (bareName.startsWith("ForgeFrontend-")) return `${prefix}-Frontend:${bareName}`;
  if (bareName.startsWith("ForgeCompute-")) return `${prefix}-Compute:${bareName}`;
  if (bareName.startsWith("ForgeIdentity-")) return `${prefix}-Identity:${bareName}`;
  return bareName;
}

function resolveEnvExport(environment, bareName) {
  return resolveExport(productionExportName(environment, bareName));
}

function envKeyForApp(app, suffix) {
  return `FORGE_${app.toUpperCase()}_${suffix}`;
}

function assertProductionFrontendConfig(app, buildEnv, environment) {
  if (environment !== "production" && environment !== "govcloud-production") {
    return;
  }

  const required = [
    "NEXT_PUBLIC_COGNITO_DOMAIN",
    "NEXT_PUBLIC_COGNITO_CLIENT_ID",
    "NEXT_PUBLIC_COGNITO_USER_POOL_ID",
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_API_URL",
  ];
  const sameOriginApi =
    (app === "industrial" || app === "field" || app === "console") &&
    (process.env.FORGE_SAME_ORIGIN_API === "1" ||
      String(buildEnv.NEXT_PUBLIC_API_URL ?? "").trim() === "");
  const missing = required.filter((key) => {
    if (sameOriginApi && key === "NEXT_PUBLIC_API_URL") return false;
    return !buildEnv[key] || String(buildEnv[key]).trim() === "";
  });
  if (missing.length) {
    throw new Error(
      `[${app}] production frontend config missing required keys: ${missing.join(", ")}`,
    );
  }

  const placeholderNeedles = [
    "localhost",
    "127.0.0.1",
    "forge-development",
    "creator-dev",
    "example.com",
    "000000000000",
    "undefined",
    "null",
    "REPLACE_ME",
    "{{",
    "${",
  ];
  for (const key of required) {
    if (sameOriginApi && key === "NEXT_PUBLIC_API_URL") continue;
    const value = String(buildEnv[key]);
    for (const needle of placeholderNeedles) {
      if (value.toLowerCase().includes(needle.toLowerCase())) {
        throw new Error(
          `[${app}] production frontend config ${key} contains placeholder/invalid value: ${needle}`,
        );
      }
    }
  }

  const apiUrl = String(buildEnv.NEXT_PUBLIC_API_URL ?? "").trim();
  if (sameOriginApi) {
    if (apiUrl !== "") {
      throw new Error(
        `[${app}] FORGE_SAME_ORIGIN_API=1 requires empty NEXT_PUBLIC_API_URL, got: ${apiUrl}`,
      );
    }
  } else if (!apiUrl.startsWith("https://")) {
    throw new Error(`[${app}] NEXT_PUBLIC_API_URL must use https://: ${apiUrl}`);
  }

  const cognitoDomain = String(buildEnv.NEXT_PUBLIC_COGNITO_DOMAIN).trim();
  if (/^https?:\/\//i.test(cognitoDomain)) {
    throw new Error(
      `[${app}] NEXT_PUBLIC_COGNITO_DOMAIN must be hostname-only (no https://): ${cognitoDomain}`,
    );
  }
  if (!cognitoDomain.includes(".auth.") || !cognitoDomain.endsWith(".amazoncognito.com")) {
    throw new Error(
      `[${app}] NEXT_PUBLIC_COGNITO_DOMAIN must contain .auth. and end with .amazoncognito.com: ${cognitoDomain}`,
    );
  }
  if (environment === "production" && cognitoDomain.includes("forge-development-")) {
    throw new Error(
      `[${app}] production NEXT_PUBLIC_COGNITO_DOMAIN must not use forge-development- domain: ${cognitoDomain}`,
    );
  }

  const poolId = String(buildEnv.NEXT_PUBLIC_COGNITO_USER_POOL_ID).trim();
  if (!poolId.startsWith("us-east-1_") && !poolId.startsWith("us-west-2_")) {
    throw new Error(
      `[${app}] NEXT_PUBLIC_COGNITO_USER_POOL_ID must start with us-east-1_ or us-west-2_: ${poolId}`,
    );
  }

  const appUrl = String(buildEnv.NEXT_PUBLIC_APP_URL).trim();
  if (!appUrl.startsWith("https://")) {
    throw new Error(`[${app}] NEXT_PUBLIC_APP_URL must use https://: ${appUrl}`);
  }

  console.log("CREATOR_PROD_CONFIG_VALIDATION: PASS");
}

function toHttpsOrigin(domain) {
  if (!domain) return null;
  const cleaned = domain.replace(/\r/g, "").split("\n")[0]?.trim() ?? "";
  if (!cleaned || cleaned === "None") return null;
  if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
    return cleaned.replace(/\/$/, "");
  }
  return `https://${cleaned.replace(/\/$/, "")}`;
}

function resolveRmsBuildEnv(environment) {
  const buildEnv = { ...process.env };

  if (!buildEnv.NEXT_PUBLIC_API_URL) {
    const apiDomain =
      resolveEnvExport(environment, "ForgeCompute-ApiHttpsDomain") ??
      process.env.FORGE_API_HTTPS_DOMAIN;
    const apiUrl = toHttpsOrigin(apiDomain);
    if (apiUrl) {
      buildEnv.NEXT_PUBLIC_API_URL = apiUrl;
      console.log(`Resolved NEXT_PUBLIC_API_URL=${apiUrl}`);
    } else {
      console.warn(
        "Missing NEXT_PUBLIC_API_URL — set it or export ForgeCompute-ApiHttpsDomain from the Compute stack.",
      );
    }
  }

  if (!buildEnv.NEXT_PUBLIC_APP_URL) {
    const appDomain =
      resolveEnvExport(environment, "ForgeFrontend-RmsDomain") ?? process.env.FORGE_RMS_APP_DOMAIN;
    const appUrl = toHttpsOrigin(appDomain);
    if (appUrl) {
      buildEnv.NEXT_PUBLIC_APP_URL = appUrl;
      console.log(`Resolved NEXT_PUBLIC_APP_URL=${appUrl}`);
    } else {
      console.warn(
        "Missing NEXT_PUBLIC_APP_URL — set it or export ForgeFrontend-RmsDomain from the Frontend stack.",
      );
    }
  }

  if (!buildEnv.NEXT_PUBLIC_COGNITO_USER_POOL_ID) {
    const poolId =
      resolveEnvExport(environment, "ForgeIdentity-UserPoolId") ??
      process.env.FORGE_COGNITO_USER_POOL_ID;
    if (poolId) {
      buildEnv.NEXT_PUBLIC_COGNITO_USER_POOL_ID = poolId;
      console.log(`Resolved NEXT_PUBLIC_COGNITO_USER_POOL_ID=${poolId}`);
    }
  }

  if (!buildEnv.NEXT_PUBLIC_COGNITO_CLIENT_ID) {
    const clientId =
      resolveEnvExport(environment, "ForgeIdentity-RmsClientId") ??
      process.env.FORGE_RMS_COGNITO_CLIENT_ID;
    if (clientId) {
      buildEnv.NEXT_PUBLIC_COGNITO_CLIENT_ID = clientId;
      console.log(`Resolved NEXT_PUBLIC_COGNITO_CLIENT_ID=${clientId}`);
    } else {
      console.warn(
        "Missing NEXT_PUBLIC_COGNITO_CLIENT_ID — ForgeIdentity-RmsClientId export is not deployed yet; set FORGE_RMS_COGNITO_CLIENT_ID.",
      );
    }
  }

  if (!buildEnv.NEXT_PUBLIC_COGNITO_DOMAIN) {
    const domain =
      resolveEnvExport(environment, "ForgeIdentity-CognitoDomain") ??
      process.env.FORGE_COGNITO_DOMAIN;
    if (domain) {
      buildEnv.NEXT_PUBLIC_COGNITO_DOMAIN = domain;
      console.log(`Resolved NEXT_PUBLIC_COGNITO_DOMAIN=${domain}`);
    } else {
      console.warn(
        "Missing NEXT_PUBLIC_COGNITO_DOMAIN — set FORGE_COGNITO_DOMAIN (forge-{env}-{accountLast6}.auth.{region}.amazoncognito.com).",
      );
    }
  }

  delete buildEnv.NEXT_PUBLIC_ALLOW_DEV_PRINCIPAL;

  assertProductionFrontendConfig("rms", buildEnv, environment);
  return buildEnv;
}

function resolveTenantAdminBuildEnv(environment) {
  const buildEnv = { ...process.env };
  if (!buildEnv.NEXT_PUBLIC_API_URL) {
    const apiDomain =
      resolveEnvExport(environment, "ForgeCompute-ApiHttpsDomain") ??
      process.env.FORGE_API_HTTPS_DOMAIN;
    const apiUrl = toHttpsOrigin(apiDomain);
    if (apiUrl) {
      buildEnv.NEXT_PUBLIC_API_URL = apiUrl;
      console.log(`Resolved NEXT_PUBLIC_API_URL=${apiUrl}`);
    }
  }
  if (!buildEnv.NEXT_PUBLIC_APP_URL) {
    const appDomain =
      resolveEnvExport(environment, "ForgeFrontend-TenantAdminDomain") ??
      process.env.FORGE_TENANTADMIN_APP_DOMAIN;
    const appUrl = toHttpsOrigin(appDomain);
    if (appUrl) {
      buildEnv.NEXT_PUBLIC_APP_URL = appUrl;
      console.log(`Resolved NEXT_PUBLIC_APP_URL=${appUrl}`);
    }
  }
  delete buildEnv.NEXT_PUBLIC_ALLOW_DEV_PRINCIPAL;
  void environment;
  return buildEnv;
}

function resolveIndustrialBuildEnv(environment) {
  const buildEnv = { ...process.env };

  if (process.env.FORGE_SAME_ORIGIN_API === "1") {
    buildEnv.NEXT_PUBLIC_API_URL = "";
    console.log("Resolved NEXT_PUBLIC_API_URL= (same-origin /api proxy)");
  } else if (!buildEnv.NEXT_PUBLIC_API_URL) {
    if (environment === "development") {
      buildEnv.NEXT_PUBLIC_API_URL = "https://api-dev.forgepublicsafety.com";
      console.log(`Resolved NEXT_PUBLIC_API_URL=${buildEnv.NEXT_PUBLIC_API_URL} (canonical)`);
    } else {
      const apiDomain =
        resolveEnvExport(environment, "ForgeCompute-ApiHttpsDomain") ??
        process.env.FORGE_API_HTTPS_DOMAIN;
      const apiUrl = toHttpsOrigin(apiDomain);
      if (apiUrl) {
        buildEnv.NEXT_PUBLIC_API_URL = apiUrl;
        console.log(`Resolved NEXT_PUBLIC_API_URL=${apiUrl}`);
      } else {
        console.warn(
          "Missing NEXT_PUBLIC_API_URL — set it or export ForgeCompute-ApiHttpsDomain from the Compute stack.",
        );
      }
    }
  }

  if (!buildEnv.NEXT_PUBLIC_APP_URL) {
    if (environment === "development") {
      buildEnv.NEXT_PUBLIC_APP_URL = "https://industrial-dev.forgepublicsafety.com";
      console.log(`Resolved NEXT_PUBLIC_APP_URL=${buildEnv.NEXT_PUBLIC_APP_URL} (canonical)`);
    } else {
      const appDomain =
        resolveEnvExport(environment, "ForgeFrontend-IndustrialDomain") ??
        process.env.FORGE_INDUSTRIAL_APP_DOMAIN;
      const appUrl = toHttpsOrigin(appDomain);
      if (appUrl) {
        buildEnv.NEXT_PUBLIC_APP_URL = appUrl;
        console.log(`Resolved NEXT_PUBLIC_APP_URL=${appUrl}`);
      } else {
        console.warn(
          "Missing NEXT_PUBLIC_APP_URL — set it or export ForgeFrontend-IndustrialDomain from the Frontend stack.",
        );
      }
    }
  }

  if (!buildEnv.NEXT_PUBLIC_APP_ENV) {
    buildEnv.NEXT_PUBLIC_APP_ENV = environment;
  }

  if (!buildEnv.NEXT_PUBLIC_COGNITO_USER_POOL_ID) {
    const poolId =
      resolveEnvExport(environment, "ForgeIdentity-UserPoolId") ??
      process.env.FORGE_COGNITO_USER_POOL_ID;
    if (poolId) {
      buildEnv.NEXT_PUBLIC_COGNITO_USER_POOL_ID = poolId;
      console.log(`Resolved NEXT_PUBLIC_COGNITO_USER_POOL_ID=${poolId}`);
    }
  }

  if (!buildEnv.NEXT_PUBLIC_COGNITO_CLIENT_ID) {
    const clientId =
      resolveEnvExport(environment, "ForgeIdentity-IndustrialClientId") ??
      process.env.FORGE_INDUSTRIAL_COGNITO_CLIENT_ID;
    if (clientId) {
      buildEnv.NEXT_PUBLIC_COGNITO_CLIENT_ID = clientId;
      console.log(`Resolved NEXT_PUBLIC_COGNITO_CLIENT_ID=${clientId}`);
    } else {
      console.warn(
        "Missing NEXT_PUBLIC_COGNITO_CLIENT_ID — set FORGE_INDUSTRIAL_COGNITO_CLIENT_ID or export ForgeIdentity-IndustrialClientId.",
      );
    }
  }

  if (!buildEnv.NEXT_PUBLIC_COGNITO_DOMAIN) {
    const domain =
      resolveEnvExport(environment, "ForgeIdentity-CognitoDomain") ??
      process.env.FORGE_COGNITO_DOMAIN;
    if (domain) {
      buildEnv.NEXT_PUBLIC_COGNITO_DOMAIN = domain;
      console.log(`Resolved NEXT_PUBLIC_COGNITO_DOMAIN=${domain}`);
    } else if (environment === "development") {
      buildEnv.NEXT_PUBLIC_COGNITO_DOMAIN =
        "forge-development-547817.auth.us-east-1.amazoncognito.com";
      console.log(
        `Resolved NEXT_PUBLIC_COGNITO_DOMAIN=${buildEnv.NEXT_PUBLIC_COGNITO_DOMAIN} (canonical)`,
      );
    } else {
      console.warn("Missing NEXT_PUBLIC_COGNITO_DOMAIN — set FORGE_COGNITO_DOMAIN.");
    }
  }

  delete buildEnv.NEXT_PUBLIC_ALLOW_DEV_PRINCIPAL;

  assertProductionFrontendConfig("industrial", buildEnv, environment);
  return buildEnv;
}

/** Field PWA shares industrial Cognito app client; APP_URL is the Field CloudFront origin. */
function resolveFieldBuildEnv(environment) {
  const buildEnv = { ...process.env };

  // SameSite=Strict __Host- session cookies only work when the SPA calls same-origin
  // /api (CloudFront proxy). Cross-origin API hosts cause silent logout on every
  // navigation once the memory bearer is gone and refresh cannot send the cookie.
  if (process.env.FORGE_SAME_ORIGIN_API === "1") {
    buildEnv.NEXT_PUBLIC_API_URL = "";
    console.log("Resolved NEXT_PUBLIC_API_URL= (same-origin /api proxy)");
  } else if (!buildEnv.NEXT_PUBLIC_API_URL) {
    if (environment === "development") {
      // Prefer same-origin when the Field CloudFront /api behavior is deployed.
      buildEnv.NEXT_PUBLIC_API_URL = "";
      console.log("Resolved NEXT_PUBLIC_API_URL= (same-origin /api proxy, development default)");
    } else if (environment === "production" || environment === "govcloud-production") {
      buildEnv.NEXT_PUBLIC_API_URL = "";
      console.log("Resolved NEXT_PUBLIC_API_URL= (same-origin /api proxy, production default)");
    } else {
      const apiDomain =
        resolveEnvExport(environment, "ForgeCompute-ApiHttpsDomain") ??
        process.env.FORGE_API_HTTPS_DOMAIN;
      const apiUrl = toHttpsOrigin(apiDomain);
      if (apiUrl) {
        buildEnv.NEXT_PUBLIC_API_URL = apiUrl;
        console.log(`Resolved NEXT_PUBLIC_API_URL=${apiUrl}`);
      } else {
        console.warn(
          "Missing NEXT_PUBLIC_API_URL — set it or export ForgeCompute-ApiHttpsDomain from the Compute stack.",
        );
      }
    }
  }

  if (!buildEnv.NEXT_PUBLIC_APP_URL) {
    const appDomain =
      resolveEnvExport(environment, "ForgeFrontend-FieldDomain") ??
      process.env.FORGE_FIELD_APP_DOMAIN;
    const appUrl = toHttpsOrigin(appDomain);
    if (appUrl) {
      buildEnv.NEXT_PUBLIC_APP_URL = appUrl;
      console.log(`Resolved NEXT_PUBLIC_APP_URL=${appUrl}`);
    } else if (environment === "development") {
      buildEnv.NEXT_PUBLIC_APP_URL = "https://dr716wyn2h1dm.cloudfront.net";
      console.log(`Resolved NEXT_PUBLIC_APP_URL=${buildEnv.NEXT_PUBLIC_APP_URL} (canonical)`);
    } else {
      console.warn(
        "Missing NEXT_PUBLIC_APP_URL — set it or export ForgeFrontend-FieldDomain from the FieldFrontend stack.",
      );
    }
  }

  if (!buildEnv.NEXT_PUBLIC_APP_ENV) {
    buildEnv.NEXT_PUBLIC_APP_ENV = environment;
  }

  if (!buildEnv.NEXT_PUBLIC_COGNITO_USER_POOL_ID) {
    const poolId =
      resolveEnvExport(environment, "ForgeIdentity-UserPoolId") ??
      process.env.FORGE_COGNITO_USER_POOL_ID;
    if (poolId) {
      buildEnv.NEXT_PUBLIC_COGNITO_USER_POOL_ID = poolId;
      console.log(`Resolved NEXT_PUBLIC_COGNITO_USER_POOL_ID=${poolId}`);
    }
  }

  if (!buildEnv.NEXT_PUBLIC_COGNITO_CLIENT_ID) {
    const clientId =
      resolveEnvExport(environment, "ForgeIdentity-IndustrialClientId") ??
      process.env.FORGE_INDUSTRIAL_COGNITO_CLIENT_ID ??
      process.env.FORGE_FIELD_COGNITO_CLIENT_ID;
    if (clientId) {
      buildEnv.NEXT_PUBLIC_COGNITO_CLIENT_ID = clientId;
      console.log(`Resolved NEXT_PUBLIC_COGNITO_CLIENT_ID=${clientId}`);
    } else {
      console.warn(
        "Missing NEXT_PUBLIC_COGNITO_CLIENT_ID — Field uses the industrial Cognito client (ForgeIdentity-IndustrialClientId).",
      );
    }
  }

  if (!buildEnv.NEXT_PUBLIC_COGNITO_DOMAIN) {
    const domain =
      resolveEnvExport(environment, "ForgeIdentity-CognitoDomain") ??
      process.env.FORGE_COGNITO_DOMAIN;
    if (domain) {
      buildEnv.NEXT_PUBLIC_COGNITO_DOMAIN = domain;
      console.log(`Resolved NEXT_PUBLIC_COGNITO_DOMAIN=${domain}`);
    } else if (environment === "development") {
      buildEnv.NEXT_PUBLIC_COGNITO_DOMAIN =
        "forge-development-547817.auth.us-east-1.amazoncognito.com";
      console.log(
        `Resolved NEXT_PUBLIC_COGNITO_DOMAIN=${buildEnv.NEXT_PUBLIC_COGNITO_DOMAIN} (canonical)`,
      );
    } else {
      console.warn("Missing NEXT_PUBLIC_COGNITO_DOMAIN — set FORGE_COGNITO_DOMAIN.");
    }
  }

  delete buildEnv.NEXT_PUBLIC_ALLOW_DEV_PRINCIPAL;
  assertProductionFrontendConfig("field", buildEnv, environment);
  return buildEnv;
}

/** Avoid Windows EPERM locks on apps/industrial-web/.next during production builds. */
function prepareIndustrialWindowsBuildDir(appRoot, buildEnv) {
  if (process.platform !== "win32") return buildEnv;
  if (!buildEnv || typeof buildEnv !== "object") return buildEnv ?? {};
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  const defaultNext = path.join(appRoot, ".next");
  let defaultNextCleared = !existsSync(defaultNext);
  if (existsSync(defaultNext)) {
    const locked = path.join(appRoot, `.next_locked_${stamp}`);
    try {
      renameSync(defaultNext, locked);
      console.log(`Renamed locked build dir ${defaultNext} -> ${locked}`);
      defaultNextCleared = true;
    } catch (error) {
      try {
        rmSync(defaultNext, { recursive: true, force: true });
        console.warn(`Removed ${defaultNext} after rename failure`);
        defaultNextCleared = !existsSync(defaultNext);
      } catch (removeError) {
        console.warn(
          `Could not rename ${defaultNext}: ${error instanceof Error ? error.message : error}`,
        );
        console.warn(
          `Could not remove ${defaultNext}: ${removeError instanceof Error ? removeError.message : removeError}`,
        );
        defaultNextCleared = false;
      }
    }
  }
  // Prefer default ".next". When Windows holds a lock (often .next/trace under the
  // IDE), fall back to a stamp distDir and let promoteIndustrialExport recover out/.
  if (defaultNextCleared) {
    delete buildEnv.NEXT_DIST_DIR;
    delete process.env.NEXT_DIST_DIR;
  } else {
    const altDist = `.next_deploy_${stamp}`;
    buildEnv.NEXT_DIST_DIR = altDist;
    process.env.NEXT_DIST_DIR = altDist;
    console.warn(`Using alternate distDir ${altDist} because default .next is locked`);
  }
  // Next 15.5+ worker threads can race and miss .next/server/pages-manifest.json
  // during "Collecting page data" on Windows.
  buildEnv.NEXT_PRIVATE_WORKER_THREADS = "false";
  process.env.NEXT_PRIVATE_WORKER_THREADS = "false";
  return buildEnv;
}

/** When distDir is overridden on Windows, Next may write the static export there instead of out/. */
function promoteIndustrialExport(appRoot, buildEnv) {
  const outPath = path.join(appRoot, "out");
  if (existsSync(path.join(outPath, "index.html"))) return outPath;
  const distDir = String(buildEnv.NEXT_DIST_DIR ?? "").trim();
  const candidates = [];
  if (distDir) candidates.push(path.join(appRoot, distDir));
  try {
    for (const entry of readdirSync(appRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith(".next_deploy_")) {
        candidates.push(path.join(appRoot, entry.name));
      }
    }
  } catch {
    // ignore
  }
  for (const exportDir of candidates) {
    if (!existsSync(path.join(exportDir, "index.html"))) continue;
    try {
      cpSync(exportDir, outPath, { recursive: true });
      console.log(`Promoted static export ${exportDir} -> ${outPath}`);
      return outPath;
    } catch (error) {
      console.warn(
        `Could not promote ${exportDir}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  return outPath;
}

/** Creator Console must bake the live API edge URL; localhost default breaks browser Import Center. */
function resolveConsoleBuildEnv(environment) {
  const buildEnv = { ...process.env };

  if (process.env.FORGE_SAME_ORIGIN_API === "1") {
    buildEnv.NEXT_PUBLIC_API_URL = "";
    console.log("Resolved NEXT_PUBLIC_API_URL= (same-origin /api proxy)");
  } else if (!buildEnv.NEXT_PUBLIC_API_URL) {
    // Prefer same-site canonical host in development so HttpOnly SameSite=Strict
    // session cookies are sent on refresh (CloudFront API hostname is cross-site).
    if (environment === "development") {
      buildEnv.NEXT_PUBLIC_API_URL = "https://api-dev.forgepublicsafety.com";
      console.log(`Resolved NEXT_PUBLIC_API_URL=${buildEnv.NEXT_PUBLIC_API_URL} (canonical)`);
    } else if (environment === "production" || environment === "govcloud-production") {
      // Production console SPA is served from *.cloudfront.net (pre-cutover). Baking the
      // API CloudFront hostname is cross-site and breaks SameSite=Strict session cookies.
      // Same-origin /api proxy is required; set FORGE_SAME_ORIGIN_API=1 after the edge
      // behaviors exist (or use this default once the proxy is live).
      buildEnv.NEXT_PUBLIC_API_URL = "";
      console.log("Resolved NEXT_PUBLIC_API_URL= (same-origin /api proxy, production default)");
    } else {
      const apiDomain =
        resolveEnvExport(environment, "ForgeCompute-ApiHttpsDomain") ??
        process.env.FORGE_API_HTTPS_DOMAIN;
      const apiUrl = toHttpsOrigin(apiDomain);
      if (apiUrl) {
        buildEnv.NEXT_PUBLIC_API_URL = apiUrl;
        console.log(`Resolved NEXT_PUBLIC_API_URL=${apiUrl}`);
      } else {
        console.warn(
          "Missing NEXT_PUBLIC_API_URL — set it or export ForgeCompute-ApiHttpsDomain from the Compute stack.",
        );
      }
    }
  }

  if (!buildEnv.NEXT_PUBLIC_APP_URL) {
    if (environment === "development") {
      buildEnv.NEXT_PUBLIC_APP_URL = "https://console-dev.forgepublicsafety.com";
      console.log(`Resolved NEXT_PUBLIC_APP_URL=${buildEnv.NEXT_PUBLIC_APP_URL} (canonical)`);
    } else {
      const appDomain =
        resolveEnvExport(environment, "ForgeFrontend-ConsoleDomain") ??
        process.env.FORGE_CONSOLE_APP_DOMAIN;
      const appUrl = toHttpsOrigin(appDomain);
      if (appUrl) {
        buildEnv.NEXT_PUBLIC_APP_URL = appUrl;
        console.log(`Resolved NEXT_PUBLIC_APP_URL=${appUrl}`);
      } else {
        console.warn(
          "Missing NEXT_PUBLIC_APP_URL — set it or export ForgeFrontend-ConsoleDomain from the Frontend stack.",
        );
      }
    }
  }

  if (!buildEnv.NEXT_PUBLIC_APP_ENV) {
    buildEnv.NEXT_PUBLIC_APP_ENV = environment;
  }

  if (!buildEnv.NEXT_PUBLIC_COGNITO_USER_POOL_ID) {
    const poolId =
      resolveEnvExport(environment, "ForgeIdentity-UserPoolId") ??
      process.env.FORGE_COGNITO_USER_POOL_ID;
    if (poolId) {
      buildEnv.NEXT_PUBLIC_COGNITO_USER_POOL_ID = poolId;
      console.log(`Resolved NEXT_PUBLIC_COGNITO_USER_POOL_ID=${poolId}`);
    }
  }

  if (!buildEnv.NEXT_PUBLIC_COGNITO_CLIENT_ID) {
    const clientId =
      resolveEnvExport(environment, "ForgeIdentity-CreatorClientId") ??
      process.env.FORGE_CONSOLE_COGNITO_CLIENT_ID ??
      process.env.FORGE_CREATOR_COGNITO_CLIENT_ID;
    if (clientId) {
      buildEnv.NEXT_PUBLIC_COGNITO_CLIENT_ID = clientId;
      console.log(`Resolved NEXT_PUBLIC_COGNITO_CLIENT_ID=${clientId}`);
    } else {
      console.warn(
        "Missing NEXT_PUBLIC_COGNITO_CLIENT_ID — ForgeIdentity-CreatorClientId export is not deployed yet; set FORGE_CONSOLE_COGNITO_CLIENT_ID or FORGE_CREATOR_COGNITO_CLIENT_ID.",
      );
    }
  }

  if (!buildEnv.NEXT_PUBLIC_COGNITO_DOMAIN) {
    const domain =
      resolveEnvExport(environment, "ForgeIdentity-CognitoDomain") ??
      process.env.FORGE_COGNITO_DOMAIN;
    if (domain) {
      buildEnv.NEXT_PUBLIC_COGNITO_DOMAIN = String(domain)
        .replace(/^https?:\/\//i, "")
        .replace(/\/$/, "");
      console.log(`Resolved NEXT_PUBLIC_COGNITO_DOMAIN=${buildEnv.NEXT_PUBLIC_COGNITO_DOMAIN}`);
    } else {
      console.warn(
        "Missing NEXT_PUBLIC_COGNITO_DOMAIN — set FORGE_COGNITO_DOMAIN (forge-{env}-{accountLast6}.auth.{region}.amazoncognito.com).",
      );
    }
  } else {
    buildEnv.NEXT_PUBLIC_COGNITO_DOMAIN = String(buildEnv.NEXT_PUBLIC_COGNITO_DOMAIN)
      .replace(/^https?:\/\//i, "")
      .replace(/\/$/, "");
  }

  // Development browser E2E uses forge-dev-principal from localStorage (no ALLOW flag required).
  delete buildEnv.NEXT_PUBLIC_ALLOW_DEV_PRINCIPAL;

  assertProductionFrontendConfig("console", buildEnv, environment);
  return buildEnv;
}

const { app, skipBuild, environment, fullInvalidate } = parseArgs(process.argv.slice(2));
const appConfig = APPS[app];
let outPath = path.join(repoRoot, appConfig.outDir);

if (!skipBuild) {
  console.log(`Building ${appConfig.packageName}…`);
  const buildEnv =
    app === "rms"
      ? resolveRmsBuildEnv(environment)
      : app === "industrial"
        ? resolveIndustrialBuildEnv(environment)
        : app === "field"
          ? resolveFieldBuildEnv(environment)
          : app === "tenantadmin"
            ? resolveTenantAdminBuildEnv(environment)
            : app === "console"
              ? resolveConsoleBuildEnv(environment)
              : { ...process.env };
  const appRoot = path.join(repoRoot, path.dirname(appConfig.outDir));
  const preparedBuildEnv =
    app === "industrial" || app === "field"
      ? prepareIndustrialWindowsBuildDir(appRoot, buildEnv)
      : buildEnv;
  const envFile = writeNextProductionEnv(appRoot, preparedBuildEnv);
  const localEnvPath = path.join(appRoot, ".env.local");
  const localEnvBackup =
    (app === "field" || app === "industrial") && existsSync(localEnvPath)
      ? `${localEnvPath}.deploy-bak`
      : null;
  if (localEnvBackup) {
    try {
      renameSync(localEnvPath, localEnvBackup);
      console.log("Temporarily moved .env.local aside for Field production bake");
    } catch (error) {
      console.warn(`Could not move .env.local: ${error instanceof Error ? error.message : error}`);
    }
  }
  try {
    const buildResult = spawnSync("pnpm", ["--filter", appConfig.packageName, "build"], {
      cwd: repoRoot,
      env: { ...process.env, ...preparedBuildEnv, NODE_ENV: "production" },
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (app === "industrial" || app === "field") {
      outPath = promoteIndustrialExport(appRoot, preparedBuildEnv);
    }
    if (buildResult.status !== 0) {
      if (existsSync(path.join(outPath, "index.html"))) {
        console.error(
          `Build failed (exit ${buildResult.status}). Refusing to deploy a recovered/stale export.`,
        );
      }
      process.exit(buildResult.status ?? 1);
    }
  } finally {
    removeFileIfExists(envFile);
    if (localEnvBackup && existsSync(localEnvBackup)) {
      try {
        renameSync(localEnvBackup, localEnvPath);
      } catch (error) {
        console.warn(
          `Could not restore .env.local: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }
}

if (!existsSync(outPath)) {
  console.error(`Build output not found: ${outPath}`);
  process.exit(1);
}

/**
 * Fail closed if a production static export still embeds development endpoints.
 * Require production Cognito/API markers; forbid development Cognito/Firebase hosts.
 * Loopback string literals inside Next polyfills are ignored separately.
 * Vendor allowlist: Brady Web SDK embeds sdk-web-prod.firebaseapp.com for its own
 * analytics — that is not a Forge development Firebase project.
 */
function assertProductionArtifactProvenance(appName, artifactRoot, envName, buildEnv) {
  if (envName !== "production" && envName !== "govcloud-production") {
    return;
  }
  const apiUrl = String(buildEnv?.NEXT_PUBLIC_API_URL ?? "").trim();
  const appUrl = String(buildEnv?.NEXT_PUBLIC_APP_URL ?? "").trim();
  // Industrial/field may bake empty API URL for same-origin CloudFront /api proxy.
  const sameOriginApi =
    (appName === "industrial" || appName === "field" || appName === "console") &&
    (apiUrl === "" || (appUrl !== "" && apiUrl === appUrl));
  const requiredMarkers = [
    sameOriginApi ? "" : apiUrl,
    String(buildEnv?.NEXT_PUBLIC_COGNITO_DOMAIN ?? "").trim(),
    String(buildEnv?.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "").trim(),
  ].filter(Boolean);
  if (sameOriginApi) {
    console.log(`PRODUCTION_ARTIFACT_PROVENANCE: accepting same-origin API proxy for ${appName}`);
  }
  const forbidden = /forge-development|creator-dev\.forgepublicsafety|firebaseapp\.com|\.web\.app/i;
  /** Strip known third-party production hosts before the Forge-dev forbid scan. */
  const stripVendorAllowlist = (text) => text.replace(/sdk-web-prod\.firebaseapp\.com/gi, "");
  const hits = [];
  let joined = "";
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (/^polyfills-.*\.js$/i.test(entry.name)) continue;
      if (!/\.(js|html|css|json|txt)$/i.test(entry.name)) continue;
      let text = "";
      try {
        text = readFileSync(full, "utf8");
      } catch {
        continue;
      }
      joined += `\n${text}`;
      const scanned = stripVendorAllowlist(text);
      if (forbidden.test(scanned)) {
        const match = scanned.match(forbidden);
        hits.push(`${path.relative(artifactRoot, full)}:${match?.[0] ?? "match"}`);
      }
    }
  };
  walk(artifactRoot);
  const artifactSameOrigin =
    (appName === "industrial" || appName === "field" || appName === "console") &&
    (joined.includes('baseUrl:""') || joined.includes("baseUrl:''"));
  if (sameOriginApi && !artifactSameOrigin) {
    console.error("PRODUCTION_ARTIFACT_PROVENANCE=FAIL");
    console.error(
      `  ${appName} same-origin build did not bake baseUrl:"" (a leftover .env API host was likely inlined)`,
    );
    throw new Error(
      `[${appName}] production artifact is not same-origin despite FORGE_SAME_ORIGIN_API`,
    );
  }
  if (artifactSameOrigin && !sameOriginApi) {
    console.log(
      `PRODUCTION_ARTIFACT_PROVENANCE: artifact bakes same-origin baseUrl for ${appName}`,
    );
  }
  const missingMarkers = requiredMarkers.filter((marker) => {
    if (artifactSameOrigin && marker === apiUrl) return false;
    return !joined.includes(marker);
  });
  if (missingMarkers.length) {
    console.error("PRODUCTION_ARTIFACT_PROVENANCE=FAIL");
    for (const marker of missingMarkers) {
      console.error(`  missing baked config marker: ${marker}`);
    }
    throw new Error(`[${appName}] production artifact missing required production config markers`);
  }
  if (hits.length) {
    console.error("PRODUCTION_ARTIFACT_PROVENANCE=FAIL");
    for (const hit of hits.slice(0, 40)) {
      console.error(`  ${hit}`);
    }
    throw new Error(
      `[${appName}] production artifact contains development references (${hits.length} files)`,
    );
  }
  console.log("PRODUCTION_ARTIFACT_PROVENANCE=PASS");
}

const provenanceBuildEnv = resolveProvenanceBuildEnv(app, environment);

if (provenanceBuildEnv && (environment === "production" || environment === "govcloud-production")) {
  assertProductionArtifactProvenance(app, outPath, environment, provenanceBuildEnv);
}

const bucket =
  process.env[envKeyForApp(app, "BUCKET")] ??
  resolveEnvExport(environment, `${appConfig.stackExportPrefix}Bucket`);
const distributionId =
  process.env[envKeyForApp(app, "DISTRIBUTION_ID")] ??
  resolveEnvExport(environment, `${appConfig.stackExportPrefix}DistributionId`);

if (!bucket) {
  console.error(
    `Set ${envKeyForApp(app, "BUCKET")} or ensure CloudFormation export ${appConfig.stackExportPrefix}Bucket exists for ${environment}.`,
  );
  process.exit(1);
}

console.log(`Syncing ${outPath} → s3://${bucket}/`);
// Two-phase sync: upload new hashed assets first WITHOUT deleting old
// `_next/static/*`. A single `sync --delete` removes prior chunks while open
// tabs still reference them; CloudFront then SPA-fallbacks those 404s to
// index.html (HTTP 200 HTML), which surfaces as RSC parse errors /
// "Request failed: 200". HTML/RSC and non-hashed files still prune with --delete.
//
// Cache-Control pairs with ForgeStaticHosting behaviors:
// hashed chunks are immutable; HTML must revalidate every request.
const IMMUTABLE_CACHE = "public,max-age=31536000,immutable";
const REVALIDATE_CACHE = "public,max-age=0,must-revalidate";
run("aws", [
  "s3",
  "sync",
  outPath,
  `s3://${bucket}/`,
  "--exclude",
  "*",
  "--include",
  "_next/static/*",
  "--cache-control",
  IMMUTABLE_CACHE,
]);
run("aws", [
  "s3",
  "sync",
  outPath,
  `s3://${bucket}/`,
  "--delete",
  "--exclude",
  "_next/static/*",
  "--cache-control",
  REVALIDATE_CACHE,
]);

if (distributionId) {
  // Industrial App Router shells under /modules/* break soft-nav to *.txt when
  // stale after deploy. Always wipe the edge for industrial; other apps keep
  // Field (and Industrial) are multi-route static exports: stale HTML for /me/,
  // /alerts/, etc. can keep referencing deleted /_next/static hashes. CloudFront
  // then SPA-fallbacks those 404s as text/html 200 and the app crashes with a
  // client-side exception. Always full-invalidate those apps.
  const invalidationPaths =
    fullInvalidate || app === "industrial" || app === "field" ? ["/*"] : ["/", "/index.html"];
  console.log(
    `Invalidating CloudFront distribution ${distributionId} paths: ${invalidationPaths.join(" ")}…`,
  );
  // shell:false avoids PowerShell globbing/eating of `/*`.
  const invalidation = spawnSync(
    "aws",
    [
      "cloudfront",
      "create-invalidation",
      "--distribution-id",
      distributionId,
      "--paths",
      ...invalidationPaths,
    ],
    { encoding: "utf8", env: process.env, shell: false },
  );
  if (invalidation.status !== 0) {
    if (invalidation.stderr) console.error(invalidation.stderr);
    process.exit(invalidation.status ?? 1);
  }
  let invalidationId = null;
  try {
    invalidationId = JSON.parse(invalidation.stdout || "{}")?.Invalidation?.Id ?? null;
  } catch {
    invalidationId = null;
  }
  if (invalidationId) {
    console.log(`Waiting for invalidation ${invalidationId}…`);
    run("aws", [
      "cloudfront",
      "wait",
      "invalidation-completed",
      "--distribution-id",
      distributionId,
      "--id",
      invalidationId,
    ]);
    console.log("CloudFront invalidation completed.");
  } else {
    console.warn("Could not parse invalidation id; continuing without wait.");
  }
} else {
  console.warn(
    `No distribution ID found (${envKeyForApp(app, "DISTRIBUTION_ID")} or ${appConfig.stackExportPrefix}DistributionId). Skipping invalidation.`,
  );
}

console.log(`Static sync complete for ${app}.`);
