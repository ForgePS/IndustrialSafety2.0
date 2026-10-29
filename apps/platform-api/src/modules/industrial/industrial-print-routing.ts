/**
 * Pure Print Manager Phase 3 routing helpers (no DB I/O).
 */
export type PrintRouteCondition = {
  locationId?: string | null;
  divisionId?: string | null;
  module?: string | null;
  recordType?: string | null;
};

export type PrintRouteAction = {
  printerId?: string | null;
  printerGroupId?: string | null;
};

export type PrintRoutingRuleMatchInput = {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  conditions: PrintRouteCondition;
  action: PrintRouteAction;
};

export type PrintRouteContext = {
  printerId?: string | null | undefined;
  locationId?: string | null | undefined;
  divisionId?: string | null | undefined;
  module?: string | null | undefined;
  recordType?: string | null | undefined;
};

export type PrintRouteDecision =
  | {
      action: "explicit";
      printerId: string;
      reason: string;
    }
  | {
      action: "rule";
      printerId?: string;
      printerGroupId?: string;
      ruleId: string;
      ruleName: string;
      reason: string;
    }
  | {
      action: "tenant_default";
      printerId: string;
      reason: string;
    }
  | {
      action: "unresolved";
      reason: string;
    };

function norm(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function conditionMatches(
  conditionValue: string | null | undefined,
  contextValue: string | null | undefined,
): boolean {
  const expected = String(conditionValue ?? "").trim();
  if (!expected) return true;
  return expected === String(contextValue ?? "").trim();
}

export function routingRuleMatches(
  rule: PrintRoutingRuleMatchInput,
  context: PrintRouteContext,
): boolean {
  if (!rule.enabled) return false;
  const c = rule.conditions ?? {};
  return (
    conditionMatches(c.locationId, context.locationId) &&
    conditionMatches(c.divisionId, context.divisionId) &&
    conditionMatches(c.module, context.module) &&
    conditionMatches(c.recordType, context.recordType)
  );
}

/**
 * Spec precedence (minimal):
 * explicit printer → matching rule (priority desc) → tenant default → unresolved
 */
export function decidePrintRoute(input: {
  context: PrintRouteContext;
  rules: PrintRoutingRuleMatchInput[];
  tenantDefaultPrinterId?: string | null;
}): PrintRouteDecision {
  const explicit = String(input.context.printerId ?? "").trim();
  if (explicit) {
    return {
      action: "explicit",
      printerId: explicit,
      reason: "User-selected printer",
    };
  }

  const ranked = [...input.rules]
    .filter((r) => routingRuleMatches(r, input.context))
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));

  const matched = ranked[0];
  if (matched) {
    const printerId = String(matched.action.printerId ?? "").trim() || undefined;
    const printerGroupId = String(matched.action.printerGroupId ?? "").trim() || undefined;
    if (!printerId && !printerGroupId) {
      return {
        action: "unresolved",
        reason: `Routing rule "${matched.name}" has no printer or group action`,
      };
    }
    return {
      action: "rule",
      ...(printerId ? { printerId } : {}),
      ...(printerGroupId ? { printerGroupId } : {}),
      ruleId: matched.id,
      ruleName: matched.name,
      reason: `Matched routing rule "${matched.name}" (priority ${matched.priority})`,
    };
  }

  const tenantDefault = String(input.tenantDefaultPrinterId ?? "").trim();
  if (tenantDefault) {
    return {
      action: "tenant_default",
      printerId: tenantDefault,
      reason: "Tenant default printer",
    };
  }

  return {
    action: "unresolved",
    reason: "No printer route found. Select a printer or configure a routing rule.",
  };
}

/** PRIMARY_FAILOVER: primary first, then sortOrder ascending. */
export function orderGroupMembersForStrategy(
  strategy: string,
  members: Array<{ printerId: string; sortOrder: number; isPrimary: boolean }>,
): string[] {
  const mode = norm(strategy) || "PRIMARY_FAILOVER";
  const sorted = [...members].sort((a, b) => {
    if (mode === "PRIMARY_FAILOVER") {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    }
    return a.sortOrder - b.sortOrder;
  });
  return sorted.map((m) => m.printerId);
}
