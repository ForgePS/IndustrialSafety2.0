import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@forge/fx-design-tokens",
    "@forge/fx-ui",
    "@forge/fx-layouts",
    "@forge/fx-hooks",
    "@forge/fx-icons",
    "@forge/fx-patterns",
    "@forge/fx-utils",
  ],
};

export default nextConfig;
