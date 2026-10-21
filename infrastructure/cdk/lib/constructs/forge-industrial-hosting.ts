import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { defaultSpaConnectSrcExtras } from "./forge-static-hosting-csp.js";
import { ForgeStaticHosting } from "./forge-static-hosting.js";

export interface ForgeIndustrialHostingProps {
  config: ForgeEnvironmentConfig;
}

/**
 * Industrial Web static hosting (IND-WEB-D1 development gate).
 *
 * Dual-serve Producers vanities on forgepublicsafety.com and
 * forgeindustrialsafety.com (aliases via CDK + scripts/cf-alias-producersrice.mjs).
 * Do not 301 to forgeindustrialsafety.com yet — customer firewalls often block
 * newly registered domains. Prefer the established forgepublicsafety.com host
 * until mill IT allowlists the new zone. Apex forgeindustrialsafety.com stays
 * marketing-only (not an alias here).
 */
export class ForgeIndustrialHosting extends ForgeStaticHosting {
  constructor(scope: Construct, id: string, props: ForgeIndustrialHostingProps) {
    const { config } = props;
    super(scope, id, {
      config,
      appKey: "industrial",
      displayName: "Industrial Web",
      domainName: config.domains?.industrial,
      // Keep vanity CNAMEs in CDK so Frontend deploys do not drop dual-serve aliases.
      additionalDomainNames: [
        "producersrice.forgeindustrialsafety.com",
        "producersrice.forgepublicsafety.com",
        "producers-rice-mill.forgepublicsafety.com",
      ],
      certificateArn: config.edge.certificateArn,
      apiProxyOriginHostname: config.domains?.api,
      cspConnectSrcExtras: defaultSpaConnectSrcExtras(config),
      // Collapse legacy hyphenated host onto the established publicsafety vanity
      // (not forgeindustrialsafety.com — see newly registered domain firewalls).
      legacyRedirects: [
        {
          from: "producers-rice-mill.forgepublicsafety.com",
          to: "producersrice.forgepublicsafety.com",
        },
      ],
      // Module pages are fully statically exported via generateStaticParams().
      // Directory index rewrite still maps /modules/{code}/ to index.html.
    });
  }
}
