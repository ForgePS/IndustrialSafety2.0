import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Dev-only: proxy /api to remote platform-api so the browser avoids CORS. */
const apiProxyTarget = (process.env.INDUSTRIAL_API_PROXY_TARGET ?? "").replace(/\/$/, "");

const resolvedDistDir = process.env.NEXT_DIST_DIR?.trim() || ".next";
if (process.env.FORGE_LOG_DIST_DIR === "1") {
  console.log(`[industrial-web] distDir=${resolvedDistDir}`);
}

const nextConfig: NextConfig = {
  transpilePackages: [
    "@forge/ui",
    "@forge/web-kit",
    "@forge/contracts",
    "@forge/import-center",
    "@forge/photo-markup",
    "@bradycorporation/brady-web-sdk",
  ],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  distDir: resolvedDistDir,
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      // Render all slide master/layout shapes (not only userDrawn) for template bars and side accents.
      "pptx-preview": path.join(__dirname, "src/vendor/pptx-preview.es.js"),
    };
    // Brady Web SDK (and similar) use asset/inline; Next's global asset.filename
    // generator is incompatible with that type — scope it to asset/resource.
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
