import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import fs from "node:fs";
import { developmentConfig } from "../lib/config/development.js";
import { NetworkStack } from "../lib/stacks/network-stack.js";
import { SecurityStack } from "../lib/stacks/security-stack.js";
import { DataStack } from "../lib/stacks/data-stack.js";

const outDir = "cdk.out.gap009-evidence";
const app = new cdk.App({ outdir: outDir });
const env = { account: developmentConfig.account, region: developmentConfig.region };
const network = new NetworkStack(app, "ForgeNetwork", { config: developmentConfig, env });
const security = new SecurityStack(app, "ForgeSecurity", { config: developmentConfig, env });
const data = new DataStack(app, "ForgeData", {
  config: developmentConfig,
  env,
  vpc: network.vpc,
  databaseSecurityGroup: network.securityGroups.databaseSg,
  storageKey: security.storageKey,
});
const template = Template.fromStack(data);
const json = template.toJSON();
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/Forge-Development-Data.template.json`, JSON.stringify(json, null, 2));
const secrets = Object.entries(json.Resources ?? {}).filter(([, r]) =>
  String((r as { Type?: string }).Type ?? "").includes("Secret"),
);
console.log(`secretResources=${secrets.length}`);
for (const [id, r] of secrets) {
  const resource = r as { Type?: string; Properties?: { Name?: string } };
  console.log(`${id} ${resource.Type} Name=${resource.Properties?.Name ?? ""}`);
}
const raw = JSON.stringify(json);
console.log(`contains-database-app=${raw.includes("database-app")}`);
console.log(`contains-AppDbSecret=${raw.includes("AppDbSecret")}`);
console.log(`contains-forge_app=${/forge_app/.test(raw)}`);
console.log(`wrote=${outDir}/Forge-Development-Data.template.json`);
