// Util Imports
import { createClient } from '@repo/supabase/server'

export async function getAuthUser() {
  const supabase = await createClient()

  const user = await supabase.auth.getUser()

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

export const getUserRoles = async () => {
  const supabase = await createClient()

  const { data: publicUser } = await getPublicUser()

  const roles = await supabase.from('user_roles').select(`*, roles (role)`).eq('user_id', publicUser?.id)

  return roles
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

  return billingRecord
}
