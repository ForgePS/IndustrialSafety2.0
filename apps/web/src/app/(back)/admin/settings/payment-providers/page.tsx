// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import Loader from '@repo/ui/components/Loader'

// Component Imports
import PaymentProvidersForm from './PaymentProvider'

export const metadata: Metadata = {
  title: 'Payment Providers'
}

const PaymentProviders = () => {
  return (
    <Suspense fallback={<Loader />}>
      <PaymentProvidersForm />
    </Suspense>
  )
}

export default PaymentProviders
