import { SetMetadata } from "@nestjs/common";

export const REQUIRE_PERMISSION_KEY = "requirePermission";

export interface RequirePermissionMeta {
  /** Single required permission (default). */
  permissionCode?: string;
  /** Allow when the principal has any of these permissions. */
  anyOf?: string[];
  resourceType?: string;
  allowWhenSuspended?: boolean;
  requiresEntitlement?: { productCode?: string; moduleCode?: string };
}

export const RequirePermission = (
  permissionCode: string,
  options?: Omit<RequirePermissionMeta, "permissionCode" | "anyOf">,
) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, {
    permissionCode,
    ...options,
  } satisfies RequirePermissionMeta);

export const RequireAnyPermission = (
  anyOf: string[],
  options?: Omit<RequirePermissionMeta, "permissionCode" | "anyOf">,
) => SetMetadata(REQUIRE_PERMISSION_KEY, { anyOf, ...options } satisfies RequirePermissionMeta);
