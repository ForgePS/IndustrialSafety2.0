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
  isAccessTokenExpiredOrNearExpiry,
  getAccessTokenExpiresAtMs,
  msUntilAccessTokenNearExpiry,
} from "./access-token.js";

export { tryRefreshSession, type TryRefreshSessionOptions } from "./session-refresh.js";

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
  getCsrfToken,
  setCsrfToken,
  clearCsrfToken,
  purgeLegacyAuthKeys,
  getActiveTenantId,
  setActiveTenantId,
  clearActiveTenantId,
  getCachedAuthMe,
  setCachedAuthMe,
  clearCachedAuthMe,
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
  isCognitoOAuthConfigured,
  redirectToCognitoLogin,
  refreshAccessToken,
  requestCognitoPasswordReset,
  confirmCognitoPasswordReset,
  validateOAuthState,
  type CognitoOAuthConfig,
  type CognitoTokenResponse,
  type SessionAuthResponse,
} from "./cognito-oauth.js";

export {
  authenticateWithPassword,
  completeNewPasswordChallenge,
  completeMfaChallenge,
  CognitoPasswordChallengeError,
  type CognitoPasswordChallenge,
} from "./cognito-password-auth.js";

export {
  AuthProvider,
  AUTH_BOOTSTRAP_TIMEOUT_MS,
  resolveSession,
  establishSession,
  useAuth,
  usePermission,
  useAnyPermission,
  useAllPermissions,
  useProductEnabled,
  useModuleEnabled,
  type AuthContextValue,
} from "./auth-provider.js";

export {
  ROLE_PREVIEW_STORAGE_KEY,
  applyRolePreviewToMe,
  clearRolePreview,
  permissionCodesFromRolePermissions,
  readRolePreview,
  writeRolePreview,
  type RolePreviewState,
} from "./role-preview.js";

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
