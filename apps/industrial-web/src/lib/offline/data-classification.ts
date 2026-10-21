/**
 * IND-10 offline data classification.
 *
 * Every industrial domain is classified before any caching decision is made.
 * The classification — not the UI — decides whether data may leave the server,
 * because an incorrect cache of safety-critical state is worse than no cache.
 */

export type OfflineClass =
  /** Field work depends on this being readable with no connectivity. */
  | "OFFLINE_REQUIRED"
  /** Helpful when cached, but the workflow still functions without it. */
  | "USEFUL"
  /** Must be read live: authorization or currency cannot be assumed. */
  | "ONLINE_REQUIRED"
  /** Never persisted on the device under any circumstances. */
  | "NEVER_CACHE";

export type OfflineDomainPolicy = {
  domain: string;
  offlineClass: OfflineClass;
  /** Cache lifetime in milliseconds. Zero means "do not persist". */
  maxAgeMs: number;
  /** Whether the domain accepts queued mutations while offline. */
  queueMutations: boolean;
  rationale: string;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const OFFLINE_DOMAIN_POLICIES: readonly OfflineDomainPolicy[] = [
  {
    domain: "industrial.loto.procedures",
    offlineClass: "OFFLINE_REQUIRED",
    maxAgeMs: 8 * HOUR,
    queueMutations: false,
    // An approved procedure must be readable at the equipment even with no
    // signal, but authoring or approving it offline is never permitted.
    rationale:
      "Approved LOTO procedures are read at the point of isolation. Read-only offline; approvals require live authorization.",
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
    domain: "industrial.inspections",
    offlineClass: "USEFUL",
    maxAgeMs: 2 * HOUR,
    queueMutations: true,
    rationale: "Inspection capture is the primary offline authoring flow.",
  },
  {
    domain: "industrial.sanitation",
    offlineClass: "USEFUL",
    maxAgeMs: 2 * HOUR,
    queueMutations: true,
    rationale:
      "Sanitation inspections and dust/spill reports are primary mill offline authoring flows.",
  },
  {
    domain: "industrial.sanitation.templates",
    offlineClass: "OFFLINE_REQUIRED",
    maxAgeMs: 8 * HOUR,
    queueMutations: false,
    rationale:
      "Sanitation checklist templates must be readable offline to start and continue mill inspections.",
  },
  {
    domain: "industrial.observations",
    offlineClass: "USEFUL",
    maxAgeMs: 2 * HOUR,
    queueMutations: true,
    rationale: "Observations are low-risk additive records safe to queue.",
  },
  {
    domain: "industrial.tasks",
    offlineClass: "USEFUL",
    maxAgeMs: HOUR,
    queueMutations: true,
    rationale: "Task lists help planning; status changes reconcile server-side.",
  },
  {
    domain: "industrial.personnel",
    offlineClass: "USEFUL",
    maxAgeMs: HOUR,
    queueMutations: false,
    rationale: "Roster lookups aid assignment. Personnel edits require live validation.",
  },
  {
    domain: "industrial.incidents",
    offlineClass: "ONLINE_REQUIRED",
    maxAgeMs: 0,
    queueMutations: false,
    rationale:
      "Incident records carry restricted narrative and permission-gated fields; they are read live only.",
  },
  {
    domain: "industrial.workers_comp",
    offlineClass: "NEVER_CACHE",
    maxAgeMs: 0,
    queueMutations: false,
    rationale: "Workers compensation cases contain medical and claim detail.",
  },
  {
    domain: "industrial.osha",
    offlineClass: "ONLINE_REQUIRED",
    maxAgeMs: 0,
    queueMutations: false,
    rationale: "Regulatory case state must never be read from a stale copy.",
  },
  {
    domain: "platform.documents",
    offlineClass: "NEVER_CACHE",
    maxAgeMs: 0,
    queueMutations: false,
    rationale:
      "Document bytes and short-lived delivery URLs are never persisted on the device.",
  },
  {
    domain: "platform.exports",
    offlineClass: "NEVER_CACHE",
    maxAgeMs: 0,
    queueMutations: false,
    rationale: "Export payloads are bulk tenant data and stay server-side.",
  },
  {
    domain: "platform.auth",
    offlineClass: "NEVER_CACHE",
    maxAgeMs: 0,
    queueMutations: false,
    rationale: "Tokens, permissions, and entitlements are re-fetched on every session.",
  },
];

const POLICY_BY_DOMAIN = new Map(
  OFFLINE_DOMAIN_POLICIES.map((policy) => [policy.domain, policy]),
);

/**
 * Unknown domains default to NEVER_CACHE so a new module cannot accidentally
 * inherit caching before it has been classified.
 */
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
