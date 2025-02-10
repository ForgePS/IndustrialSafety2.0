// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { getAuthUser, getPublicPaymentProvider } from '@repo/supabase/serverHelpers'
import { createClient } from '@repo/supabase/server'

// Component Imports
import Billing from './Billing'

export const metadata: Metadata = {
  title: 'Billing'
}

const BillingPage = async () => {
  const supabase = await createClient()
  const { data: userRecord } = await getAuthUser()

  // fetch payment provider from settings
  const { data: paymentProvider } = await getPublicPaymentProvider()

  const { data: billingData } = await supabase
    .from('billing')
    .select('*')
    .eq('user_id', userRecord?.user?.id)
    .order('id', { ascending: true })

  return <Billing billingRecord={billingData || []} paymentProvider={paymentProvider?.value} />
}

export default BillingPage
