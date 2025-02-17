// Type Imports
import type { Permission } from './types'

// Cache for storing permission results
const permissionCache = new Map<string, boolean>()

export const ROUTE_PERMISSIONS = [
  // --- Reviews Routes ---
  { pattern: /^\/admin\/reviews\/(?:platform|review)\/create/, permissions: ['view_reviews', 'create_reviews'] },
  { pattern: /^\/admin\/reviews\/(?:platform|review)\/\d+\/edit$/, permissions: ['view_reviews', 'update_reviews'] },
  { pattern: /^\/admin\/reviews/, permissions: ['view_reviews'] },

  // --- Settings Route ---
  { pattern: /^\/admin\/settings/, permissions: ['view_settings'] },

  // --- Users Routes ---
  { pattern: /^\/admin\/users\/create/, permissions: ['view_users', 'create_users'] },
  { pattern: /^\/admin\/users\/\d+\/edit$/, permissions: ['view_users', 'update_users'] },
  { pattern: /^\/admin\/users/, permissions: ['view_users'] },

  // --- Roles Routes ---
  { pattern: /^\/admin\/roles\/create/, permissions: ['view_roles', 'create_roles'] },
  { pattern: /^\/admin\/roles\/\d+\/edit$/, permissions: ['view_roles', 'update_roles'] },
  { pattern: /^\/admin\/roles/, permissions: ['view_roles'] },

  // --- Permissions Routes ---
  { pattern: /^\/admin\/permissions\/create/, permissions: ['view_permissions', 'create_permissions'] },
  { pattern: /^\/admin\/permissions/, permissions: ['view_permission'] },

  // --- FAQs Routes ---
  { pattern: /^\/admin\/faqs\/(?:faq|category)\/create/, permissions: ['create_faqs'] },
  { pattern: /^\/admin\/faqs\/(?:faq|category)\/\d+\/edit$/, permissions: ['update_faqs'] },
  { pattern: /^\/admin\/faqs/, permissions: ['view_faqs'] },

  // --- Keystatic Routes ---
  { pattern: /^\/keystatic/, permissions: ['manage_blog_section'] }
]

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
