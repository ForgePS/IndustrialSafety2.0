import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { defaultSpaConnectSrcExtras } from "./forge-static-hosting-csp.js";
import { ForgeStaticHosting } from "./forge-static-hosting.js";

export interface ForgeTenantAdminHostingProps {
  config: ForgeEnvironmentConfig;
}

/** Tenant Admin static hosting (Configuration Platform delegated console). */
export class ForgeTenantAdminHosting extends ForgeStaticHosting {
  constructor(scope: Construct, id: string, props: ForgeTenantAdminHostingProps) {
    const { config } = props;
    super(scope, id, {
      config,
      appKey: "tenantadmin",
      displayName: "Tenant Admin",
      domainName: config.domains?.tenantAdmin,
      certificateArn: config.edge.certificateArn,
      apiProxyOriginHostname: config.domains?.api,
      cspConnectSrcExtras: defaultSpaConnectSrcExtras(config),
    });
  }
}
