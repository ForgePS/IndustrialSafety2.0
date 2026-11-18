/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup-env.ts"],
    // CDK synth is CPU-bound and synchronous; the first synth in a file takes 10-25s.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Cap workers: one fork per core starves the vitest main process on busy
    // machines ("[vitest-worker]: Timeout calling onTaskUpdate" unhandled errors,
    // which fail the run). GitHub-hosted runners have 4 vCPUs, so CI is unaffected.
    maxWorkers: 4,
  },
});
