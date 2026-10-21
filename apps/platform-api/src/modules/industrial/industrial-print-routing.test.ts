import { describe, expect, it } from "vitest";
import {
  decidePrintRoute,
  orderGroupMembersForStrategy,
  routingRuleMatches,
} from "./industrial-print-routing.js";

describe("print routing helpers", () => {
  it("matches rules only when enabled conditions align", () => {
    const rule = {
      id: "r1",
      name: "Stuttgart LOTO",
      priority: 100,
      enabled: true,
      conditions: { locationId: "loc-1", module: "LOCKOUT_TAGOUT" },
      action: { printerId: "p1" },
    };
    expect(
      routingRuleMatches(rule, {
        locationId: "loc-1",
        module: "LOCKOUT_TAGOUT",
      }),
    ).toBe(true);
    expect(
      routingRuleMatches(rule, {
        locationId: "loc-2",
        module: "LOCKOUT_TAGOUT",
      }),
    ).toBe(false);
    expect(
      routingRuleMatches({ ...rule, enabled: false }, { locationId: "loc-1", module: "LOCKOUT_TAGOUT" }),
    ).toBe(false);
  });

  it("prefers explicit printer, then highest-priority rule, then tenant default", () => {
    const rules = [
      {
        id: "low",
        name: "Low",
        priority: 10,
        enabled: true,
        conditions: { module: "FLEET" },
        action: { printerId: "fleet-low" },
      },
      {
        id: "high",
        name: "High",
        priority: 200,
        enabled: true,
        conditions: { module: "FLEET" },
        action: { printerId: "fleet-high" },
      },
    ];

    expect(
      decidePrintRoute({
        context: { printerId: "user-pick", module: "FLEET" },
        rules,
        tenantDefaultPrinterId: "tenant-default",
      }),
    ).toEqual({
      action: "explicit",
      printerId: "user-pick",
      reason: "User-selected printer",
    });

    expect(
      decidePrintRoute({
        context: { module: "FLEET" },
        rules,
        tenantDefaultPrinterId: "tenant-default",
      }),
    ).toMatchObject({
      action: "rule",
      printerId: "fleet-high",
      ruleId: "high",
    });

    expect(
      decidePrintRoute({
        context: { module: "TRAINING" },
        rules,
        tenantDefaultPrinterId: "tenant-default",
      }),
    ).toEqual({
      action: "tenant_default",
      printerId: "tenant-default",
      reason: "Tenant default printer",
    });

    expect(
      decidePrintRoute({
        context: { module: "TRAINING" },
        rules,
        tenantDefaultPrinterId: null,
      }).action,
    ).toBe("unresolved");
  });

  it("orders PRIMARY_FAILOVER members with primary first", () => {
    expect(
      orderGroupMembersForStrategy("PRIMARY_FAILOVER", [
        { printerId: "b", sortOrder: 0, isPrimary: false },
        { printerId: "a", sortOrder: 1, isPrimary: true },
        { printerId: "c", sortOrder: 2, isPrimary: false },
      ]),
    ).toEqual(["a", "b", "c"]);
  });
});
