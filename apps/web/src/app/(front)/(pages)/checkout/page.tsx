// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { createServiceRoleClient } from '@repo/supabase/server'
import { getAuthUser, getPublicPaymentProvider } from '@repo/supabase/serverHelpers'

// Component Imports
import HeaderSection from './HeaderSection'
import CheckoutDetails from './CheckoutDetails'

export const metadata: Metadata = {
  title: 'Checkout',
  alternates: {
    canonical: 'https://jetship-nextjs-saas-boilerplate-demo.vercel.app/checkout'
  }
}

const CheckoutPage = async () => {
  const supabase = createServiceRoleClient()

  const { data: paymentProvider } = await getPublicPaymentProvider()

  const { data: userRecord } = await getAuthUser()

  const {
    data: { users }
  } = await supabase.auth.admin.listUsers()

  return (
    <>
      <HeaderSection />
      <CheckoutDetails paymentProvider={paymentProvider?.value} userRecord={userRecord?.user} users={users} />
    </>
  )
}

export default CheckoutPage
