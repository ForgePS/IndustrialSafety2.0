/**
 * Field offline data classification (Phase 10).
 * Mirrors industrial IND-10: classification decides caching/queueing, not the UI.
 */

export type OfflineClass = "OFFLINE_REQUIRED" | "USEFUL" | "ONLINE_REQUIRED" | "NEVER_CACHE";

export type OfflineDomainPolicy = {
  domain: string;
  offlineClass: OfflineClass;
  maxAgeMs: number;
  queueMutations: boolean;
  rationale: string;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const OFFLINE_DOMAIN_POLICIES: readonly OfflineDomainPolicy[] = [
  {
    domain: "industrial.emergency_response",
    offlineClass: "OFFLINE_REQUIRED",
    maxAgeMs: 8 * HOUR,
    queueMutations: false,
    rationale: "Emergency procedures and contacts must be readable with no signal.",
  },
  {
    domain: "industrial.emergency_alerts.settings",
    offlineClass: "OFFLINE_REQUIRED",
    maxAgeMs: 8 * HOUR,
    queueMutations: false,
    rationale: "Plant emergency number is needed offline.",
  },
  {
    domain: "industrial.emergency_alerts",
    offlineClass: "USEFUL",
    maxAgeMs: HOUR,
    queueMutations: false,
    rationale: "Active alert snapshots help awareness; live status is preferred when online.",
  },
  {
    domain: "industrial.loto.procedures",
    offlineClass: "OFFLINE_REQUIRED",
    maxAgeMs: 8 * HOUR,
    queueMutations: false,
    rationale: "Approved LOTO procedures are read at the point of isolation.",
  },
  {
    domain: "industrial.equipment",
    offlineClass: "OFFLINE_REQUIRED",
    maxAgeMs: 8 * HOUR,
    queueMutations: false,
    rationale: "Asset identity is needed to resolve a scanned tag in the field.",
  },
  {
    domain: "industrial.forms.definitions",
    offlineClass: "OFFLINE_REQUIRED",
    maxAgeMs: 8 * HOUR,
    queueMutations: false,
    rationale: "Form structure must be available to start a field submission offline.",
  },
  {
    domain: "industrial.forms.submissions",
    offlineClass: "USEFUL",
    maxAgeMs: 2 * HOUR,
    queueMutations: true,
    rationale: "Form draft/submit capture is a primary offline authoring flow.",
  },
  {
    domain: "industrial.inspections",
    offlineClass: "USEFUL",
    maxAgeMs: 2 * HOUR,
    queueMutations: true,
    rationale: "Inspection capture is a primary offline authoring flow.",
  },
  {
    domain: "industrial.sanitation",
    offlineClass: "USEFUL",
    maxAgeMs: 2 * HOUR,
    queueMutations: true,
    rationale: "Sanitation inspections are a primary mill offline authoring flow.",
  },
  {
    domain: "industrial.sanitation.templates",
    offlineClass: "OFFLINE_REQUIRED",
    maxAgeMs: 8 * HOUR,
    queueMutations: false,
    rationale: "Sanitation checklist templates must be readable offline.",
  },
  {
    domain: "industrial.observations",
    offlineClass: "USEFUL",
    maxAgeMs: 2 * HOUR,
    queueMutations: true,
    rationale: "Observations and hazards are low-risk additive records safe to queue.",
  },
  {
    domain: "industrial.corrective_actions",
    offlineClass: "USEFUL",
    maxAgeMs: 2 * HOUR,
    queueMutations: true,
    rationale: "Equipment issue corrective actions are safe to queue offline.",
  },
  {
    domain: "industrial.tasks",
    offlineClass: "USEFUL",
    maxAgeMs: HOUR,
    queueMutations: true,
    rationale: "Task status changes reconcile server-side.",
  },
  {
    domain: "industrial.incidents",
    offlineClass: "ONLINE_REQUIRED",
    maxAgeMs: 0,
    queueMutations: false,
    rationale:
      "Incident records carry restricted narrative and permission-gated fields; they are online-only.",
  },
  {
    domain: "platform.documents",
    offlineClass: "NEVER_CACHE",
    maxAgeMs: 0,
    queueMutations: false,
    rationale: "Document bytes and short-lived delivery URLs are never persisted.",
  },
  {
    domain: "platform.auth",
    offlineClass: "NEVER_CACHE",
    maxAgeMs: 0,
    queueMutations: false,
    rationale: "Tokens, permissions, and entitlements are re-fetched on every session.",
  },
];

const POLICY_BY_DOMAIN = new Map(OFFLINE_DOMAIN_POLICIES.map((policy) => [policy.domain, policy]));

export function classifyDomain(domain: string): OfflineDomainPolicy {
  return (
    POLICY_BY_DOMAIN.get(domain) ?? {
      domain,
      offlineClass: "NEVER_CACHE",
      maxAgeMs: 0,
      queueMutations: false,
      rationale: "Unclassified domain. Add an explicit policy before enabling offline use.",
    }
  );
}

export function isCacheable(domain: string): boolean {
  const policy = classifyDomain(domain);
  return (
    policy.maxAgeMs > 0 &&
    (policy.offlineClass === "OFFLINE_REQUIRED" || policy.offlineClass === "USEFUL")
  );
}

export function acceptsQueuedMutations(domain: string): boolean {
  return classifyDomain(domain).queueMutations;
}

export function domainMaxAgeMs(domain: string): number {
  return classifyDomain(domain).maxAgeMs;
}
