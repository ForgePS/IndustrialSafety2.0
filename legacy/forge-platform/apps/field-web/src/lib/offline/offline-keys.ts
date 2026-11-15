export const OFFLINE_STORAGE_PREFIX = "forge.field.offline.v1";
/** Legacy sanitation queue key — migrated into the unified queue on first flush. */
export const LEGACY_SANITATION_QUEUE_KEY = "forge.field.sanitation.queue";
export const MAX_QUEUE_LENGTH = 50;
export const MAX_MUTATION_ATTEMPTS = 5;

export type CacheStore = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
