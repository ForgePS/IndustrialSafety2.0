import { describe, expect, it } from "vitest";
import { parseConditionExpression } from "./condition-parser.js";
import { evaluateRule, type RuleNode } from "./rules.js";

describe("parseConditionExpression", () => {
  it("parses equals / notEquals / boolean literals", () => {
    const parsed = parseConditionExpression("structure_unit = TRUE");
    expect(parsed.status).toBe("PARSED");
    expect(parsed.rule).toEqual({ field: "structure_unit", equals: true });
  });

  it("parses AND / OR / NOT without eval", () => {
    const parsed = parseConditionExpression("structure_unit = TRUE & location_use = commercial");
    expect(parsed.status).toBe("PARSED");
    expect(parsed.rule && "all" in parsed.rule).toBe(true);
  });

  it("parses contains / includes / is null", () => {
    expect(parseConditionExpression("final_incident_type includes fire").rule).toEqual({
      field: "final_incident_type",
      contains: "fire",
    });
    expect(parseConditionExpression("incident_noaction is null").rule).toEqual({
      field: "incident_noaction",
      exists: false,
    });
  });

  it("marks prose as NEEDS_REVIEW unparsed", () => {
    const parsed = parseConditionExpression("use_type indicates inside structure");
    expect(parsed.status).toBe("NEEDS_REVIEW");
    expect(parsed.rule).toEqual({
      kind: "unparsed",
      raw: "use_type indicates inside structure",
      status: "NEEDS_REVIEW",
    });
  });

  it("does not execute dynamic code", () => {
    const parsed = parseConditionExpression("process.exit(1)");
    expect(parsed.status).toBe("NEEDS_REVIEW");
  });
});

describe("evaluateRule", () => {
  it("evaluates all supported operators", () => {
    const ctx = {
      a: "STRUCTURE_FIRE",
      b: true,
      c: 5,
      d: ["FIRE", "MEDICAL"],
      e: null,
    };
    expect(evaluateRule({ field: "a", equals: "STRUCTURE_FIRE" }, ctx)).toBe(true);
    expect(evaluateRule({ field: "a", notEquals: "MEDICAL" }, ctx)).toBe(true);
    expect(evaluateRule({ field: "a", contains: "FIRE" }, ctx)).toBe(true);
    expect(evaluateRule({ field: "d", in: ["MEDICAL"] }, ctx)).toBe(true);
    expect(evaluateRule({ field: "c", greaterThan: 3 }, ctx)).toBe(true);
    expect(evaluateRule({ field: "c", lessThan: 10 }, ctx)).toBe(true);
    expect(evaluateRule({ field: "b", exists: true }, ctx)).toBe(true);
    expect(evaluateRule({ field: "e", exists: false }, ctx)).toBe(true);
    expect(
      evaluateRule(
        {
          all: [
            { field: "b", equals: true },
            {
              any: [
                { field: "a", contains: "STRUCTURE" },
                { field: "c", lessThan: 1 },
              ],
            },
          ],
        },
        ctx,
      ),
    ).toBe(true);
    expect(evaluateRule({ not: { field: "b", equals: false } }, ctx)).toBe(true);
  });

  it("treats unparsed rules as false", () => {
    const node: RuleNode = { kind: "unparsed", raw: "prose", status: "NEEDS_REVIEW" };
    expect(evaluateRule(node, {})).toBe(false);
  });
});
