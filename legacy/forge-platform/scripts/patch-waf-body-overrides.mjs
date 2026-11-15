/**
 * Count-override SizeRestrictions_BODY and CrossSiteScripting_BODY on the
 * production Common Rule Set. Signature data URLs in personnel PATCH bodies
 * otherwise return a raw 403 from WAF.
 *
 * Usage: AWS_PROFILE=forge-dev node scripts/patch-waf-body-overrides.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const OVERRIDES = [
  { Name: "SizeRestrictions_BODY", ActionToUse: { Count: {} } },
  { Name: "CrossSiteScripting_BODY", ActionToUse: { Count: {} } },
];

function patchRules(rules) {
  return rules.map((rule) => {
    const group = rule?.Statement?.ManagedRuleGroupStatement;
    if (group?.Name !== "AWSManagedRulesCommonRuleSet") return rule;
    return {
      ...rule,
      Statement: {
        ...rule.Statement,
        ManagedRuleGroupStatement: {
          ...group,
          RuleActionOverrides: OVERRIDES,
        },
      },
    };
  });
}

function updateAcl(file, scope) {
  const parsed = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  const acl = parsed.WebACL;
  const payload = {
    Name: acl.Name,
    Scope: scope,
    Id: acl.Id,
    DefaultAction: acl.DefaultAction,
    VisibilityConfig: acl.VisibilityConfig,
    LockToken: parsed.LockToken,
    Rules: patchRules(acl.Rules),
  };
  if (acl.Description) payload.Description = acl.Description;
  const out = file.replace(".json", "-update.json");
  writeFileSync(out, JSON.stringify(payload, null, 2));
  const result = spawnSync(
    "aws",
    ["wafv2", "update-web-acl", "--cli-input-json", `file://${out}`, "--region", "us-east-1"],
    { encoding: "utf8", shell: true },
  );
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  console.log(`updated ${acl.Name}`);
}

updateAcl(".tmp-cf-waf.json", "CLOUDFRONT");
updateAcl(".tmp-alb-waf.json", "REGIONAL");
