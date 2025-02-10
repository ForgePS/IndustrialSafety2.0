// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { createServiceRoleClient } from '@repo/supabase/server'
import { getAuthUser, getPublicPaymentProvider } from '@repo/supabase/serverHelpers'

// Component Imports
import HeaderSection from './HeaderSection'
import CheckoutDetails from './CheckoutDetails'

// Util Imports
import { getAppName } from '@/utils/getAppName'

export const metadata: Metadata = {
  title: 'Checkout',
  alternates: {
    canonical: 'https://demos.themeselection.com/jetship-nextjs-starter-kit-demo/checkout'
  }
}

const CheckoutPage = async () => {
  const supabase = createServiceRoleClient()

  const appName = await getAppName()
  const { data: paymentProvider } = await getPublicPaymentProvider()

  const { data: userRecord } = await getAuthUser()

  const {
    data: { users }
  } = await supabase.auth.admin.listUsers()

  return (
    <>
      <HeaderSection />
      <CheckoutDetails
        paymentProvider={paymentProvider?.value}
        userRecord={userRecord?.user}
        appName={appName}
        users={users}
      />
    </>
  )
}

export default CheckoutPage
