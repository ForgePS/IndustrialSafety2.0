// Util Imports
import { createClient } from '@repo/supabase/client'

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

export const getPublicGeneralSettings = async () => {
  const supabase = createClient()

  const generalSettingRecord = await supabase
    .from('settings_configuration')
    .select('value')
    .eq('key', 'general_settings')
    .single()

  return generalSettingRecord
}

export const getPublicPaymentProvider = async () => {
  const supabase = createClient()

  const paymentProviderRecord = await supabase
    .from('settings_configuration')
    .select('value')
    .eq('key', 'payment_provider')
    .single()

  return paymentProviderRecord
}
