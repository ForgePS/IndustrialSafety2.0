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
 * Legacy vanity: producers-rice-mill → producersrice (FIS-L02). DNS/CF aliases for
 * both hosts remain managed by scripts/cf-alias-producersrice.mjs and
 * scripts/ind11b-p2-cf-alias-producers-dark.mjs — do not delete those aliases.
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
