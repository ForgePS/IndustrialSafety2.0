// Third-party Imports
import { TbInfoCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import Trans from '@repo/i18n/Trans'
import type { Database } from '@repo/supabase/types'

// Component Imports
import PlansDetails from './PlansDetails'
import BillingDetails from './BillingDetails'

// Data Imports
import planData from '@configs/billingConfig'

type Props = {
  billingRecord: Database['public']['Tables']['billing']['Row'][]
  paymentProvider: Database['public']['Enums']['billing_provider_enum']
}

const Billing = ({ billingRecord, paymentProvider }: Props) => {
  // Find the last successful billing record
  const successfulBillings = billingRecord?.filter(record => record.status === 'success') || []
  const lastSuccessfulBilling = successfulBillings[successfulBillings.length - 1]

  return (
    <div className='flex flex-col gap-y-8'>
      <h1 className='text-textPrimary text-2xl font-bold sm:text-3xl'>
        <Trans i18nKey='dashboard:billingTitle' />
      </h1>
      {!planData || planData.length === 0 ? (
        <Alert>
          <TbInfoCircle className='bs-6 is-6' />
          <AlertDescription>
            <Trans i18nKey='dashboard:noPlansFoundAlert' />
          </AlertDescription>
        </Alert>
      ) : lastSuccessfulBilling ? (
        <BillingDetails
          billingRecord={lastSuccessfulBilling}
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
