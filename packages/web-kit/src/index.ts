export {
  configureApiClient,
  getApiBaseUrl,
  getApiClientConfig,
  apiGet,
  apiGetResult,
  apiSend,
  apiSendResult,
  apiFetchRaw,
  toIfMatch,
  createIdempotencyKey,
  ApiError,
  ApiConflictError,
  type ApiSuccess,
  type ApiRequestOptions,
  type ApiResult,
  type ApiClientConfig,
} from "./api-client.js";

export {
  assertAccessTokenShape,
  InvalidAccessTokenError,
} from "./access-token.js";

export {
  getDevPrincipal,
  setDevPrincipal,
  clearDevPrincipal,
  getBearerToken,
  setBearerToken,
  clearBearerToken,
  getRefreshToken,
  setRefreshToken,
  clearRefreshToken,
  getActiveTenantId,
  setActiveTenantId,
  clearActiveTenantId,
  clearAuthStorage,
  parseDevPrincipal,
  type DevPrincipal,
} from "./auth-storage.js";

export {
  authMe,
  selectTenant,
  logoutAll,
  listEffectiveFeatures,
  type AuthMe,
  type AuthTenant,
  type EffectiveFeature,
} from "./auth-api.js";

export { switchActiveTenant } from "./tenant-switch.js";

export {
  useTenantScopedEffect,
  resolveActiveTenantId,
  syncTenantIdInUrl,
} from "./tenant-scoped.js";

export {
  buildAuthorizeUrl,
  buildLogoutUrl,
  CognitoOAuthError,
  exchangeCodeForTokens,
  generateCodeChallenge,
  generateCodeVerifier,
  getCognitoOAuthConfig,
  redirectToCognitoLogin,
  refreshAccessToken,
  requestCognitoPasswordReset,
  confirmCognitoPasswordReset,
  validateOAuthState,
  type CognitoOAuthConfig,
  type CognitoTokenResponse,
} from "./cognito-oauth.js";

export {
  AuthProvider,
  AUTH_BOOTSTRAP_TIMEOUT_MS,
  resolveSession,
  useAuth,
  usePermission,
  useAnyPermission,
  useAllPermissions,
  useProductEnabled,
  useModuleEnabled,
  type AuthContextValue,
} from "./auth-provider.js";

export {
  sessionProductEnabled,
  sessionModuleEnabled,
  sessionEntitlements,
  filterNavigationForSession,
  type SessionEntitlementSource,
} from "./entitlements.js";

export { useFeatureFlag, useFeatureFlags } from "./use-feature-flags.js";

export {
  paginate,
  filterBySearch,
  sortByField,
  totalPages,
  pageRange,
  buildListQuery,
  useServerListControls,
  ListControlsView,
  type PaginationMeta,
  type ServerListQuery,
  type ServerListState,
  type ListControlsProps,
  type ListControlsClassNames,
} from "./list-controls.js";
