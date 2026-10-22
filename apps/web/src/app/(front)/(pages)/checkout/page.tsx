// Next Imports
import Link from 'next/link'
import { cookies } from 'next/headers'
import type { Metadata } from 'next'

// Third-party Imports
import { getAuthUser, getPublicPaymentProvider } from '@repo/supabase/serverHelpers'
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/ui/alert'
import { TbAlertTriangle } from 'react-icons/tb'
import { cn } from '@repo/ui/lib/utils'

// Component Imports
import HeaderSection from './HeaderSection'
import CheckoutDetails from './CheckoutDetails'

// Styles Imports
import frontCommonStyles from '../styles.module.css'

export const metadata: Metadata = {
  title: 'Checkout',
  alternates: {
    canonical: 'https://jetship-nextjs-saas-boilerplate-demo.vercel.app/checkout'
  }
}

const CheckoutPage = async () => {
  const cookieStore = await cookies()

  const { data: paymentProvider } = await getPublicPaymentProvider()

  const { data: userRecord } = await getAuthUser()

  const isCheckoutCookieSet = cookieStore.has('checkoutData')

  return (
    <>
      <HeaderSection />
      {isCheckoutCookieSet ? (
        <CheckoutDetails paymentProvider={paymentProvider?.value} userRecord={userRecord?.user} />
      ) : (
        <div className={cn('plb-20', frontCommonStyles.layoutSpacing)}>
          <Alert variant='tonalWarning'>
            <TbAlertTriangle className='bs-6 is-6' />
            <AlertTitle>Plan not found</AlertTitle>
            <AlertDescription>
              Please select a plan to continue. You can select a plan from{' '}
              <Link href='/#pricing-section' className='underline'>
                here
              </Link>
              .
            </AlertDescription>
          </Alert>
        </div>
      )}
    </>
  )
}

export default CheckoutPage
