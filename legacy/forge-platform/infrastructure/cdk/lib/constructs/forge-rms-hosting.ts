import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { defaultSpaConnectSrcExtras } from "./forge-static-hosting-csp.js";
import { ForgeStaticHosting } from "./forge-static-hosting.js";

export interface ForgeRmsHostingProps {
  config: ForgeEnvironmentConfig;
}

/** RMS Web static hosting (NERIS Phase 2). Thin wrapper over ForgeStaticHosting. */
export class ForgeRmsHosting extends ForgeStaticHosting {
  constructor(scope: Construct, id: string, props: ForgeRmsHostingProps) {
    const { config } = props;
    super(scope, id, {
      config,
      appKey: "rms",
      displayName: "RMS Web",
      domainName: config.domains?.rms,
      certificateArn: config.edge.certificateArn,
      apiProxyOriginHostname: config.domains?.api,
      cspConnectSrcExtras: defaultSpaConnectSrcExtras(config),
    });
  }
}
