import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: [
    "@forge/ui",
    "@forge/design-system",
    "@forge/sneat",
    "@forge/import-center",
    "@forge/web-kit",
  ],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
