import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ["@forge/ui", "@forge/design-system"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
