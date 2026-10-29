import type { AiNarrativeProviderRequest, AiNarrativeProviderResponse } from "./schemas.js";

/**
 * Provider abstraction — product modules must not call vendors directly.
 * Selection is driven by environment, tenant, product, classification,
 * feature flags, and approved model policy.
 */
export interface AiNarrativeProvider {
  readonly providerKey: string;
  generateNarrative(request: AiNarrativeProviderRequest): Promise<AiNarrativeProviderResponse>;
}

export type AiProviderSelectionContext = {
  environment: string;
  tenantId: string;
  product: string;
  dataClassification: string;
  featureFlags: Record<string, boolean>;
  modelPolicyId?: string | null;
};
