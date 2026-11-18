import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Dev-only: proxy /api to remote platform-api so the browser avoids CORS. */
const apiProxyTarget = (process.env.FIELD_API_PROXY_TARGET ?? "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  transpilePackages: [
    "@forge/web-kit",
    "@forge/contracts",
    "@forge/photo-markup",
    "@bradycorporation/brady-web-sdk",
  ],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  webpack: (config) => {
    // Brady Web SDK uses asset/inline; Next's global asset.filename is incompatible.
    const assetGenerator = config.module?.generator?.asset;
    if (assetGenerator?.filename) {
      config.module.generator = config.module.generator ?? {};
      if (!config.module.generator["asset/resource"]) {
        config.module.generator["asset/resource"] = assetGenerator;
      }
      delete config.module.generator.asset;
    }
    return config;
  },
  // Static export is for production deploy only; dev server needs dynamic routes.
  ...(process.env.NODE_ENV === "production"
    ? {
        output: "export" as const,
        // Deploy syncs must not block on next/eslint a11y drift; `pnpm lint` still runs in CI.
        eslint: { ignoreDuringBuilds: true },
        experimental: {
          webpackBuildWorker: false,
          cpus: 1,
        },
      }
    : {}),
  trailingSlash: true,
  // Avoid 308s on /api/* when proxying to platform-api (web-kit paths have no trailing slash).
  skipTrailingSlashRedirect: true,
  images: {
    unoptimized: true,
  },
  async rewrites() {
    if (process.env.NODE_ENV === "production" || !apiProxyTarget) return [];
    return [
      { source: "/api/:path*", destination: `${apiProxyTarget}/api/:path*` },
      { source: "/health", destination: `${apiProxyTarget}/health` },
    ];
  },
};

export default nextConfig;
