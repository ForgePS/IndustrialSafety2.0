/**
 * CSP + legacy-host redirect helpers for ForgeStaticHosting (FIS-M01 / FIS-L02).
 * Kept pure so unit tests can assert policy shape without synthesizing a stack.
 */

export type LegacyHostRedirect = { from: string; to: string };

export type BuildCspInput = {
  allowIframeEmbedding?: boolean;
  apiProxyOriginHostname?: string;
  cspConnectSrcExtras?: string[];
};

/** Query keys stripped on legacy vanity 301 (OAuth / session leakage). */
export const LEGACY_REDIRECT_STRIP_QUERY_PARAMS = [
  "code",
  "state",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "session",
] as const;

/** Cognito hosted UI + IdP endpoints derived from environment config. */
export function cognitoConnectSrcExtras(input: {
  environmentName: string;
  account: string;
  region: string;
}): string[] {
  const cognitoHost = `forge-${input.environmentName}-${input.account.slice(-6)}.auth.${input.region}.amazoncognito.com`;
  return [
    `https://${cognitoHost}`,
    `https://cognito-idp.${input.region}.amazonaws.com`,
  ];
}

/** Default connect-src extras for SPA edge (Cognito, office preview, blob media). */
export function defaultSpaConnectSrcExtras(input: {
  environmentName: string;
  account: string;
  region: string;
}): string[] {
  return [
    ...cognitoConnectSrcExtras(input),
    "https://view.officeapps.live.com",
    "https://*.officeapps.live.com",
    "blob:",
  ];
}

export function buildContentSecurityPolicy(input: BuildCspInput): string {
  const connectSrc = new Set<string>(["'self'"]);
  const apiHost = input.apiProxyOriginHostname?.trim().replace(/^https?:\/\//i, "");
  if (apiHost) {
    connectSrc.add(`https://${apiHost}`);
  }
  for (const extra of input.cspConnectSrcExtras ?? []) {
    const value = extra.trim();
    if (value) connectSrc.add(value);
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    input.allowIframeEmbedding ? "frame-ancestors *" : "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: data: https:",
    "frame-src 'self' blob: data: https://view.officeapps.live.com https://*.officeapps.live.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    // style-src keeps unsafe-inline for Sneat/Bootstrap until externalized (FIS-M01 scripts only).
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // Theme FOUC boots are externalized under /theme-boot.js — no unsafe-inline / unsafe-eval.
    "script-src 'self'",
    `connect-src ${[...connectSrc].join(" ")}`,
    "form-action 'self' https:",
  ].join("; ");
}

/**
 * CloudFront Function JS snippet: 301 legacy vanity hosts and strip OAuth/session query keys.
 * Inserted at the top of the viewer-request handler body.
 */
export function buildLegacyHostRedirectSnippet(
  redirects: LegacyHostRedirect[] | undefined,
): string {
  const pairs = (redirects ?? [])
    .map((r) => ({
      from: r.from.trim().toLowerCase(),
      to: r.to.trim().toLowerCase().replace(/^https?:\/\//i, ""),
    }))
    .filter((r) => r.from && r.to && r.from !== r.to);
  if (pairs.length === 0) return "";

  const mapEntries = pairs.map((r) => `    '${r.from}': '${r.to}'`).join(",\n");
  const stripKeysObject = LEGACY_REDIRECT_STRIP_QUERY_PARAMS.map(
    (k) => ` '${k}': true`,
  ).join(",");

  return `
  // FIS-L02: permanent redirect for legacy vanity hosts (aliases kept via cf-alias scripts).
  var legacyHosts = {
${mapEntries}
  };
  var reqHost = (headers['host'] && headers['host'].value || '').toLowerCase();
  var legacyTarget = legacyHosts[reqHost];
  if (legacyTarget) {
    var stripKeys = {${stripKeysObject}};
    var q = request.querystring || {};
    var kept = [];
    for (var key in q) {
      if (!Object.prototype.hasOwnProperty.call(q, key)) continue;
      if (stripKeys[key.toLowerCase()]) continue;
      var entry = q[key];
      if (entry && entry.multiValue) {
        for (var i = 0; i < entry.multiValue.length; i++) {
          kept.push(encodeURIComponent(key) + '=' + encodeURIComponent(entry.multiValue[i].value));
        }
      } else if (entry && entry.value !== undefined) {
        kept.push(encodeURIComponent(key) + '=' + encodeURIComponent(entry.value));
      }
    }
    var loc = 'https://' + legacyTarget + uri + (kept.length ? '?' + kept.join('&') : '');
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: { value: loc },
        'cache-control': { value: 'no-store' },
      },
    };
  }
`;
}
