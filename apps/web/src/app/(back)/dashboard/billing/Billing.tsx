// Third-party Imports
import { TbInfoCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import type { Database } from '@repo/supabase/types'

// Component Imports
import PlansDetails from './PlansDetails'
import BillingDetails from './BillingDetails'

// Data Imports
import planData from '@configs/billingConfig'

type Props = {
  billingRecord: Database['public']['Tables']['billing']['Row']
  paymentProvider: Database['public']['Enums']['billing_provider_enum']
}

const Billing = ({ billingRecord, paymentProvider }: Props) => {
  return (
    <div className='space-b-6'>
      <h1 className='mbe-4 text-3xl font-bold'>Billing</h1>
      {!planData || planData.length === 0 ? (
        <Alert>
          <TbInfoCircle className='bs-6 is-6' />
          <AlertDescription>No plans found. Please contact admin to update the plan.</AlertDescription>
        </Alert>
      ) : billingRecord && billingRecord?.status === 'success' ? (
        <BillingDetails
          billingRecord={billingRecord}
          paymentType={planData[0].variants[0].paymentType}
          paymentProvider={paymentProvider}
        />
      ) : (
        <PlansDetails planData={planData} />
      )}
    </div>
  )
}

export default Billing
