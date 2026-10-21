import { PrintSupplyAlertLevel } from "@forge/contracts";

const ALERT_RANK: Record<string, number> = {
  [PrintSupplyAlertLevel.NONE]: 0,
  [PrintSupplyAlertLevel.LOW]: 1,
  [PrintSupplyAlertLevel.CRITICAL]: 2,
  [PrintSupplyAlertLevel.EMPTY]: 3,
};

/**
 * Derive supply alert level from estimated remaining vs thresholds.
 * Empty takes precedence; critical/warning use inclusive thresholds.
 */
export function computeSupplyAlertLevel(input: {
  estimatedRemaining: number;
  warningThreshold: number;
  criticalThreshold: number;
}): (typeof PrintSupplyAlertLevel)[keyof typeof PrintSupplyAlertLevel] {
  const remaining = Math.max(0, Math.floor(input.estimatedRemaining));
  if (remaining <= 0) return PrintSupplyAlertLevel.EMPTY;
  const critical = Math.max(0, Math.floor(input.criticalThreshold));
  const warning = Math.max(0, Math.floor(input.warningThreshold));
  if (remaining <= critical) return PrintSupplyAlertLevel.CRITICAL;
  if (remaining <= warning) return PrintSupplyAlertLevel.LOW;
  return PrintSupplyAlertLevel.NONE;
}

/** True when the new level is strictly worse than the previous. */
export function supplyAlertLevelWorsened(previous: string, next: string): boolean {
  return (ALERT_RANK[next] ?? 0) > (ALERT_RANK[previous] ?? 0);
}

/**
 * Apply estimated consumption after a successful print.
 * Returns new remaining/consumed and whether an alert should fire.
 */
export function applyEstimatedSupplyConsumption(input: {
  estimatedRemaining: number;
  unitsConsumed: number;
  warningThreshold: number;
  criticalThreshold: number;
  lastAlertLevel: string;
  unitsUsed: number;
}): {
  estimatedRemaining: number;
  unitsConsumed: number;
  alertLevel: (typeof PrintSupplyAlertLevel)[keyof typeof PrintSupplyAlertLevel];
  shouldNotify: boolean;
} {
  const used = Math.max(0, Math.floor(input.unitsUsed));
  const estimatedRemaining = Math.max(0, Math.floor(input.estimatedRemaining) - used);
  const unitsConsumed = Math.max(0, Math.floor(input.unitsConsumed) + used);
  const alertLevel = computeSupplyAlertLevel({
    estimatedRemaining,
    warningThreshold: input.warningThreshold,
    criticalThreshold: input.criticalThreshold,
  });
  return {
    estimatedRemaining,
    unitsConsumed,
    alertLevel,
    shouldNotify: supplyAlertLevelWorsened(input.lastAlertLevel, alertLevel),
  };
}

export function supplyPercentRemaining(starting: number, remaining: number): number | null {
  const start = Math.floor(starting);
  if (start <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((Math.max(0, remaining) / start) * 100)));
}
