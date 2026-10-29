import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { defaultSpaConnectSrcExtras } from "./forge-static-hosting-csp.js";
import { ForgeStaticHosting } from "./forge-static-hosting.js";

export interface ForgeConsoleHostingProps {
  config: ForgeEnvironmentConfig;
}

/** Creator Console static hosting (ADR-026). Thin wrapper over ForgeStaticHosting. */
export class ForgeConsoleHosting extends ForgeStaticHosting {
  constructor(scope: Construct, id: string, props: ForgeConsoleHostingProps) {
    const { config } = props;
    super(scope, id, {
      config,
      appKey: "console",
      displayName: "Creator Console",
      domainName: config.domains?.creator,
      certificateArn: config.edge.certificateArn,
      apiProxyOriginHostname: config.domains?.api,
      cspConnectSrcExtras: defaultSpaConnectSrcExtras(config),
    });
  }
}
