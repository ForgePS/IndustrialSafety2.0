export {
  classifyDomain,
  isCacheable,
  acceptsQueuedMutations,
  domainMaxAgeMs,
  OFFLINE_DOMAIN_POLICIES,
  type OfflineClass,
  type OfflineDomainPolicy,
} from "./data-classification";

export {
  resolveConflict,
  type ConflictDecision,
  type ConflictInput,
  type ConflictStrategy,
} from "./conflict";

export {
  FieldMutationQueue,
  migrateLegacySanitationQueue,
  MAX_QUEUE_LENGTH,
  MAX_MUTATION_ATTEMPTS,
  OFFLINE_STORAGE_PREFIX,
  type QueuedMutation,
  type OfflineScope,
  type EnqueueMutationInput,
} from "./mutation-queue";

export {
  FieldOfflineCache,
  clearAllOfflineData,
  policyAllowsCache,
  type CacheScope,
} from "./cache";

export {
  setOfflineScope,
  getOfflineScope,
  getMutationQueue,
  getOfflineCache,
  pendingOfflineCount,
  enqueueOfflineMutation,
  flushOfflineQueue,
  offlineSend,
  subscribeOfflinePending,
} from "./sync";

export {
  ensureOfflineStore,
  getOfflineStoreSync,
  MemoryCacheStore,
  setOfflineStoreForTests,
} from "./dexie-store";
