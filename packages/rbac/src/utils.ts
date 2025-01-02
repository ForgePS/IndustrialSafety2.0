// Type Imports
import type { Permission } from './types'

// Cache for storing permission results
const permissionCache = new Map<string, boolean>()

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
