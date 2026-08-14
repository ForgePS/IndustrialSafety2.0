import { describe, expect, it } from "vitest";
import { isOriginAllowed, parseCorsOriginRules } from "./cors-origin.js";

describe("parseCorsOriginRules", () => {
  it("normalizes exact origins and host suffixes", () => {
    const rules = parseCorsOriginRules(
      "https://Industrial.ForgePublicSafety.com, https://d204ytvvxvsqgl.cloudfront.net",
      "forgepublicsafety.com, .example.org",
    );
    expect(rules.exactOrigins).toEqual([
      "https://industrial.forgepublicsafety.com",
      "https://d204ytvvxvsqgl.cloudfront.net",
    ]);
    expect(rules.hostSuffixes).toEqual([".forgepublicsafety.com", ".example.org"]);
  });
});

describe("isOriginAllowed", () => {
  const rules = parseCorsOriginRules(
    "https://industrial.forgepublicsafety.com,https://d204ytvvxvsqgl.cloudfront.net",
    "forgepublicsafety.com",
  );

  it("allows exact listed origins", () => {
    expect(isOriginAllowed("https://industrial.forgepublicsafety.com", rules)).toBe(true);
    expect(isOriginAllowed("https://d204ytvvxvsqgl.cloudfront.net", rules)).toBe(true);
  });

  it("allows first-party tenant vanity hosts via suffix", () => {
    expect(isOriginAllowed("https://producers-rice-mill.forgepublicsafety.com", rules)).toBe(
      true,
    );
  });

  it("rejects foreign origins", () => {
    expect(isOriginAllowed("https://evil.example", rules)).toBe(false);
    expect(isOriginAllowed("https://forgepublicsafety.com.evil.example", rules)).toBe(false);
  });

  it("rejects http and non-origin forms for suffix matches", () => {
    expect(isOriginAllowed("http://producers-rice-mill.forgepublicsafety.com", rules)).toBe(
      false,
    );
    expect(isOriginAllowed("https://producers-rice-mill.forgepublicsafety.com:8443", rules)).toBe(
      false,
    );
    expect(isOriginAllowed("https://producers-rice-mill.forgepublicsafety.com/path", rules)).toBe(
      false,
    );
  });

  it("does not treat the bare apex as a suffix match", () => {
    // Suffix trust is for provisioned hosts under the zone, not the apex itself.
    expect(isOriginAllowed("https://forgepublicsafety.com", rules)).toBe(false);
  });
});
