// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { getBillingRecords, getPublicPaymentProvider } from '@repo/supabase/serverHelpers'
import Loader from '@repo/ui/components/Loader'

// Component Imports
import Billing from './Billing'

export const metadata: Metadata = {
  title: 'Billing'
}

const BillingSection = async () => {
  // fetch payment provider from settings
  const { data: billingData } = await getBillingRecords()
  const { data: paymentProvider } = await getPublicPaymentProvider()

  return <Billing billingRecord={billingData || []} paymentProvider={paymentProvider?.value} />
}

const BillingPage = () => {
  return (
    <Suspense fallback={<Loader />}>
      <BillingSection />
    </Suspense>
  )
}

export default BillingPage
