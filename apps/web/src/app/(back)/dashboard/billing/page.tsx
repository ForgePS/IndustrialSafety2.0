// Third-party Imports
import { getBillingRecords, getPublicPaymentProvider } from '@repo/supabase/serverHelpers'

// Component Imports
import Billing from './Billing'

const BillingPage = async () => {
  // fetch billing record from subscription table
  const { data: billingRecords } = await getBillingRecords()

  // get the latest billing record
  const billingRecord = billingRecords?.[billingRecords.length - 1]

  // fetch payment provider from settings
  const { data: paymentProvider } = await getPublicPaymentProvider()

  return <Billing billingRecord={billingRecord} paymentProvider={paymentProvider?.value} />
}

export default BillingPage
