// Third-party Imports
import { jwtDecode } from 'jwt-decode'
import type { JwtPayload } from 'jwt-decode'
import type { UserResponse } from '@supabase/supabase-js'

// Util Imports
import { createClient, createServiceRoleClient } from '@repo/supabase/server'

type JWT = JwtPayload & {
  roles: string[]
  permissions: string[]
}

export async function getAuthUser(): Promise<UserResponse> {
  const supabase = await createClient()

  const {
    data: { session }
  } = await supabase.auth.refreshSession()

  const user = await supabase.auth.getUser()

  if (user.data.user && session) {
    const supabaseServiceRole = createServiceRoleClient()

    const jwt: JWT = jwtDecode(session.access_token)

    const updatedUser = await supabaseServiceRole.auth.admin.updateUserById(user.data.user.id, {
      user_metadata: {
        ...user.data.user.user_metadata,
        roles: jwt.roles,
        permissions: jwt.permissions
      }
    })

    return updatedUser
  }

  return user
}

export const getPublicUser = async (column: string = '*') => {
  const supabase = await createClient()

  const {
    data: { user }
  } = await getAuthUser()

  const userRecord = await supabase
    .from('users')
    .select(column as '*')
    .eq('user_id', user?.id)
    .single()

  return userRecord
}

export const getUserPermissions = async (): Promise<string[] | undefined> => {
  const supabase = await createClient()

  const { data: publicUser } = await getPublicUser()

  const { data: userRoles } = await supabase
    .from('user_roles')
    .select(
      `
      *,
      roles (
        role,
        role_permissions (
          permissions (
            permission
          )
        )
      )
    `
    )
    .eq('user_id', publicUser.id)

  const permissions = [
    ...new Set(
      userRoles?.flatMap(({ roles }) =>
        roles.role_permissions.flatMap(
          ({ permissions }: { permissions: { permission: string } }) => permissions.permission
        )
      )
    )
  ]

  return permissions
}

export const getUserRoles = async (): Promise<string[] | undefined> => {
  const {
    data: { user }
  } = await getAuthUser()

  return user?.user_metadata.roles
}

export const getPublicGeneralSettings = async () => {
  const supabase = await createClient()

  const generalSettingRecord = await supabase
    .from('settings_configuration')
    .select('value')
    .eq('key', 'general_settings')
    .single()

  return generalSettingRecord
}

export const getPublicPaymentProvider = async () => {
  const supabase = await createClient()

  const paymentProviderRecord = await supabase
    .from('settings_configuration')
    .select('value')
    .eq('key', 'payment_provider')
    .single()

  return paymentProviderRecord
}

export const getBillingRecords = async (column: string = '*') => {
  const supabase = await createClient()

  const {
    data: { user }
  } = await getAuthUser()

  const billingRecord = await supabase
    .from('billing')
    .select(column as '*')
    .eq('user_id', user?.id)
    .order('id', { ascending: true })

  return billingRecord
}

export const getFaqCategories = async (column: string = '*') => {
  const supabase = await createClient()

  const categoriesRecord = await supabase
    .from('faq_categories')
    .select(column as '*')
    .order('id', { ascending: true })

  return categoriesRecord
}

export const getFaqCategory = async (id: number, column: string = '*') => {
  const supabase = await createClient()

  const categoryRecord = await supabase
    .from('faq_categories')
    .select(column as '*')
    .eq('id', id)
    .single()

  return categoryRecord
}

export const getFeaturedFaqs = async (column: string = '*') => {
  const supabase = await createClient()

  const faqsRecord = await supabase
    .from('faqs')
    .select(column as '*')
    .eq('is_featured', true)
    .order('id', { ascending: true })

  return faqsRecord
}

export const getFaqs = async (column: string = '*') => {
  const supabase = await createClient()

  const faqsRecord = await supabase
    .from('faqs')
    .select(column as '*')
    .order('id', { ascending: true })

  return faqsRecord
}

export const getFaq = async (id: number, column: string = '*') => {
  const supabase = await createClient()

  const faqRecord = await supabase
    .from('faqs')
    .select(column as '*')
    .eq('id', id)
    .single()

  return faqRecord
}

export const getReviewPlatforms = async (column: string = '*') => {
  const supabase = await createClient()

  const reviewPlatformsRecord = await supabase
    .from('review_platforms')
    .select(column as '*')
    .order('id', { ascending: true })

  return reviewPlatformsRecord
}

export const getReviewPlatform = async (id: number, column: string = '*') => {
  const supabase = await createClient()

  const reviewPlatformRecord = await supabase
    .from('review_platforms')
    .select(column as '*')
    .eq('id', id)
    .single()

  return reviewPlatformRecord
}

export const getFeaturedReviews = async (column: string = '*') => {
  const supabase = await createClient()

  const reviewsRecord = await supabase
    .from('reviews')
    .select(column as '*')
    .eq('is_featured', true)
    .order('id', { ascending: true })

  return reviewsRecord
}

export const getReviews = async (column: string = '*') => {
  const supabase = await createClient()

  const reviewsRecord = await supabase
    .from('reviews')
    .select(column as '*')
    .order('id', { ascending: true })

  return reviewsRecord
}

export const getReview = async (id: number, column: string = '*') => {
  const supabase = await createClient()

  const reviewRecord = await supabase
    .from('reviews')
    .select(column as '*')
    .eq('id', id)
    .single()

  return reviewRecord
}

export const getUsers = async (column: string = '*') => {
  const supabase = await createClient()

  const usersRecord = await supabase
    .from('users')
    .select(column as '*')
    .order('id', { ascending: true, nullsFirst: false })

  return usersRecord
}

export const getRoles = async (column: string = '*') => {
  const supabase = await createClient()

  const rolesRecord = await supabase.from('roles').select(column as '*')

  return rolesRecord
}

export const getRole = async (id: number, column: string = '*') => {
  const supabase = await createClient()

  const roleRecord = await supabase
    .from('roles')
    .select(column as '*')
    .eq('id', id)
    .single()

  return roleRecord
}

export const getRoleWithUsers = async (id: number, column: string = '*') => {
  const supabase = await createClient()

  const roleWithUsersRecord = await supabase
    .from('roles')
    .select(column as '*')
    .eq('id', id)

  return roleWithUsersRecord
}

export const getPermissions = async (column: string = '*') => {
  const supabase = await createClient()

  const permissionsRecord = await supabase
    .from('permissions')
    .select(column as '*')
    .order('id', { ascending: true })

  return permissionsRecord
}

export const getPermission = async (id: number, column: string = '*') => {
  const supabase = await createClient()

  const permissionRecord = await supabase
    .from('permissions')
    .select(column as '*')
    .eq('id', id)
    .single()

  return permissionRecord
}

export const getRolePermissionsByPermissionId = async (id: number, column: string = '*') => {
  const supabase = await createClient()

  const rolePermissionsRecord = await supabase
    .from('role_permissions')
    .select(column as '*')
    .eq('permission_id', id)

  return rolePermissionsRecord
}

export const getRolePermissionsByRoleId = async (id: number, column: string = '*') => {
  const supabase = await createClient()

  const rolePermissionsRecord = await supabase
    .from('role_permissions')
    .select(column as '*')
    .eq('role_id', id)

  return rolePermissionsRecord
}

export const getAllUserRoles = async (column: string = '*') => {
  const supabase = await createClient()

  const rolesRecord = await supabase.from('user_roles').select(column as '*')

  return rolesRecord
}

export const getServiceUser = async (id: number, column: string = '*') => {
  const supabase = createServiceRoleClient()

  const usersRecord = await supabase
    .from('users')
    .select(column as '*')
    .eq('id', id)
    .single()

  return usersRecord
}

export const getServiceUserRoles = async (id: number, column: string = '*') => {
  const supabase = createServiceRoleClient()

  const rolesRecord = await supabase
    .from('user_roles')
    .select(column as '*')
    .eq('user_id', id)

  return rolesRecord
}
