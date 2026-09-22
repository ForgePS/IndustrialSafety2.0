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
 * Vanity dual-serve: producersrice.forgepublicsafety.com remains live while
 * producersrice.forgeindustrialsafety.com is added (FIS industrial zone move).
 * Permanent 301s to the industrialsafety host are a later flip — do not enable
 * them in legacyRedirects until cutover. DNS/CF aliases remain managed by
 * scripts/cf-alias-producersrice.mjs — do not delete those aliases.
 *
 * Legacy vanity: producers-rice-mill → producersrice (FIS-L02).
 */
export class ForgeIndustrialHosting extends ForgeStaticHosting {
  constructor(scope: Construct, id: string, props: ForgeIndustrialHostingProps) {
    const { config } = props;
    super(scope, id, {
      config,
      appKey: "industrial",
      displayName: "Industrial Web",
      domainName: config.domains?.industrial,
      certificateArn: config.edge.certificateArn,
      apiProxyOriginHostname: config.domains?.api,
      cspConnectSrcExtras: defaultSpaConnectSrcExtras(config),
      // Matches existing branding vanity host hardcoding pattern.
      legacyRedirects: [
        {
          from: "producers-rice-mill.forgepublicsafety.com",
          to: "producersrice.forgepublicsafety.com",
        },
      ],
      // Module pages are fully statically exported via generateStaticParams().
      // Directory index rewrite still maps /modules/{code}/ → index.html.
    });
  }
}
