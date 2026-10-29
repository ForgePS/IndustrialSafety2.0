#!/usr/bin/env node
import { runPlatformApiOneOff } from "./ecs-oneoff.mjs";

runPlatformApiOneOff(
  ["node", "/app/packages/database/dist/neris/import-schema.js"],
  "neris-import",
);
