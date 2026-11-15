/**
 * Client helpers for per-role industrial module page (tab) visibility.
 */
import {
  enabledPageIdsFromPermissionCodes,
  filterModulePages,
  industrialModulePageCatalog,
  mergePermissionCodesWithModulePages,
  modulePagePermissionOk,
  type IndustrialModulePageCatalog,
} from "@forge/contracts";

export {
  enabledPageIdsFromPermissionCodes,
  filterModulePages,
  industrialModulePageCatalog,
  mergePermissionCodesWithModulePages,
  modulePagePermissionOk,
};

export function catalogsForSelectedModules(
  selectedModuleCodes: readonly string[],
): IndustrialModulePageCatalog[] {
  const out: IndustrialModulePageCatalog[] = [];
  for (const code of selectedModuleCodes) {
    const catalog = industrialModulePageCatalog(code);
    if (catalog) out.push(catalog);
  }
  return out;
}

export function ensureActiveModuleTab<T extends string>(
  active: T,
  visibleIds: readonly string[],
  fallback?: T,
): T {
  if (visibleIds.includes(active)) return active;
  if (fallback && visibleIds.includes(fallback)) return fallback;
  return (visibleIds[0] as T | undefined) ?? active;
}
