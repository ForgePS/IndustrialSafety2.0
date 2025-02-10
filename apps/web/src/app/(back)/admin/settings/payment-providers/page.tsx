// Next Imports
import type { Metadata } from 'next'

// Component Imports
import PaymentProvidersForm from './PaymentProvider'

export const metadata: Metadata = {
  title: 'Payment Providers'
}

const PaymentProviders = () => {
  return <PaymentProvidersForm />
}

export default PaymentProviders
