/**
 * Browser Origin allowlist for the API.
 *
 * Tenants are served from vanity hosts (e.g. https://acme.forgepublicsafety.com)
 * that are provisioned per tenant at onboarding. Enumerating every host in an
 * exact allowlist means each new tenant needs an API redeploy, and any host that
 * is missed fails in the browser as an opaque "Failed to fetch". Suffix rules let
 * a whole zone of first-party hosts be trusted without redeploying per tenant.
 */
export type CorsOriginRules = {
  /** Fully-qualified origins trusted verbatim (e.g. CloudFront default domains). */
  exactOrigins: string[];
  /** Host suffixes trusted over https, each including the leading dot. */
  hostSuffixes: string[];
};

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseCorsOriginRules(
  origins: string | undefined,
  suffixes: string | undefined,
): CorsOriginRules {
  return {
    exactOrigins: splitList(origins).map((origin) => origin.toLowerCase()),
    hostSuffixes: splitList(suffixes)
      .map((suffix) => suffix.toLowerCase())
      // Accept "forgepublicsafety.com" or ".forgepublicsafety.com" in config.
      .map((suffix) => (suffix.startsWith(".") ? suffix : `.${suffix}`)),
  };
}

export function isOriginAllowed(origin: string, rules: CorsOriginRules): boolean {
  const candidate = origin.trim().toLowerCase();
  if (!candidate) return false;
  if (rules.exactOrigins.includes(candidate)) return true;
  if (rules.hostSuffixes.length === 0) return false;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  // Suffix trust is limited to https and to the bare origin form: a port,
  // credentials or path would mean this is not one of our provisioned hosts.
  if (url.protocol !== "https:") return false;
  if (url.port || url.username || url.password) return false;
  if (candidate !== `https://${url.hostname}`) return false;

  return rules.hostSuffixes.some(
    (suffix) => url.hostname.endsWith(suffix) && url.hostname.length > suffix.length,
  );
}
