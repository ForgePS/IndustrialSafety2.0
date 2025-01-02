// React Imports
import type { ReactNode } from 'react'

// Type Imports
import type { Permission } from './types'
import { hasAllPermissions, hasAnyPermission, hasPermission } from './utils'

type Props = {
  permissions: Permission[]
  children: ReactNode
  fallback?: ReactNode
}

type PermissionGuardProps = Props & {
  permission: Permission
}

type AnyPermissionGuardProps = Props & {
  requiredPermissions: Permission[]
}

type AllPermissionsGuardProps = Props & {
  requiredPermissions: Permission[]
}

export const PermissionGuard = ({ permissions, permission, children, fallback = null }: PermissionGuardProps) => {
  const hasAccess = hasPermission(permissions, permission)

  return <>{hasAccess ? children : fallback}</>
}

export const AnyPermissionGuard = ({
  permissions,
  requiredPermissions,
  children,
  fallback = null
}: AnyPermissionGuardProps) => {
  const hasAccess = hasAnyPermission(permissions, requiredPermissions)

  return <>{hasAccess ? children : fallback}</>
}

export const AllPermissionsGuard = ({
  permissions,
  requiredPermissions,
  children,
  fallback = null
}: AllPermissionsGuardProps) => {
  const hasAccess = hasAllPermissions(permissions, requiredPermissions)

  return <>{hasAccess ? children : fallback}</>
}
