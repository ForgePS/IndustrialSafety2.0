// Type Imports
import type { Permission } from './types'

// Cache for storing permission results
const permissionCache = new Map<string, boolean>()

// Route-level permission rules. The template admin pages these used to guard were removed, so there are
// none today; a rule here would turn a deleted page into a /not-authorized redirect instead of a 404.
export const ROUTE_PERMISSIONS: { pattern: RegExp; permissions: Permission[] }[] = []

export const clearPermissionCache = () => {
  permissionCache.clear()
}

export const getCacheKey = (userId: string, permission: Permission) => `${userId}:${permission}`

export const hasPermission = (userPermissions: Permission[] | undefined, requiredPermission: Permission): boolean => {
  if (!userPermissions) return false

  return userPermissions.includes(requiredPermission)
}

export const hasAnyPermission = (
  userPermissions: Permission[] | undefined,
  requiredPermissions: Permission[]
): boolean => {
  if (!userPermissions) return false

  return requiredPermissions.some(permission => userPermissions.includes(permission))
}

export const hasAllPermissions = (
  userPermissions: Permission[] | undefined,
  requiredPermissions: Permission[]
): boolean => {
  if (!userPermissions) return false

  return requiredPermissions.every(permission => userPermissions.includes(permission))
}

export const checkRoutePermissions = (path: string, userPermissions: Permission[]): boolean => {
  for (const { pattern, permissions } of ROUTE_PERMISSIONS) {
    if (pattern.test(path)) {
      // Check that the user has all permissions listed for this route.
      if (!permissions.every(p => hasPermission(userPermissions, p))) {
        return false
      }
    }
  }

  return true
}
