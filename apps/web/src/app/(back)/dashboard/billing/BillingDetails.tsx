'use client'

// React Imports
import { useEffect, useState, useTransition } from 'react'

// Third-party Imports
import { TbArrowRight } from 'react-icons/tb'
import { Skeleton } from '@repo/ui/components/ui/skeleton'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@repo/ui/components/ui/card'
import { createBillingPortalSession, getSubscribeData } from '@repo/billing/src/actions'
import Trans from '@repo/i18n/Trans'
import type { Database } from '@repo/supabase/types'

// Data Imports
import plans from '@configs/billingConfig'

type Props = {
  billingRecord: Database['public']['Tables']['billing']['Row']
  paymentType: 'recurring' | 'one-off'
  paymentProvider: Database['public']['Enums']['billing_provider_enum']
}

const BillingDetails = ({ billingRecord, paymentType, paymentProvider }: Props) => {
  // States
  const [loading, setLoading] = useState(true)
  const [billingCustomer, setBillingCustomer] = useState<any | []>([])
  const [pending, startTransition] = useTransition()

  // Redirect to the billing portal or download the receipt
  const handleSubmit = () => {
    startTransition(async () => {
      if (paymentProvider === 'lemon_squeezy') {
        window.open(
          paymentType === 'recurring'
            ? billingCustomer.data.attributes.urls.customer_portal
            : billingCustomer.data.attributes.urls.receipt,
          '_blank'
        )
      } else {
        // Stripe
        if (billingCustomer.object === 'charge') {
          window.open(billingCustomer.receipt_url, '_blank')
        } else {
          // Create a billing portal session
          const data = await createBillingPortalSession(
            plans,
            billingCustomer.subscriptions.customer,
            window.location.origin
          )

          if (data.url) {
            window.open(data.url, '_blank') // Open the customer portal link in a new tab
          } else {
            alert('Error creating customer portal link')
          }
        }
      }
    })
  }

  // Fetch the plan details from the billing table which contains the customer's billing details
  useEffect(() => {
    const fetchSubscribeData = async () => {
      const response = await getSubscribeData(billingRecord.order_id, paymentType, billingRecord.billing_provider)

      if (response.status === 200) {
        setBillingCustomer(response.data)
      } else {
        console.error('Failed to fetch subscribe data')
      }

      setLoading(false) // Set loading to false once data is fetched
    }

    fetchSubscribeData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return loading ? (
    <>
      <Skeleton className='is-full bs-60' />
      <Skeleton className='is-full bs-44 mbs-6' />
    </>
  ) : (
    <>
      <Card>
        <CardHeader className='border-be'>
          <CardTitle className='text-xl font-medium'>
            <Trans i18nKey='dashboard:yourPlanTitle' />
          </CardTitle>
          <CardDescription>
            <Trans i18nKey='dashboard:yourPlanDescription' />
          </CardDescription>
        </CardHeader>
        <CardContent className='pbs-4'>
          <div className='flex flex-col items-start gap-2'>
            <div className='flex gap-2'>
              <p className='font-semibold'>
                <Trans i18nKey='dashboard:planVariantLabel' />:
              </p>
              <p>{billingRecord.plan_variant}</p>
            </div>
          </div>
          <div className='mbs-2 flex items-center gap-2'>
            <p className='font-semibold'>
              <Trans i18nKey='dashboard:paymentDetailsLabel' />:
            </p>
            <p>{`${paymentType === 'recurring' ? `Billed ${billingRecord.interval}` : 'Paid'} - ${billingRecord.currency} ${billingRecord.cost}`}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-xl font-medium'>
            <Trans i18nKey='dashboard:billingDetailsTitle' />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription>
            <Trans i18nKey='dashboard:billingDetailsDescription' />
          </CardDescription>
          <form action={handleSubmit}>
            <Button type='submit' disabled={pending} className='mbs-4'>
              {pending ? (
                <>
                  <Trans
                    i18nKey={
                      paymentType === 'recurring' ? 'dashboard:openingPortalText' : 'dashboard:downloadingReceiptText'
                    }
                  />
                  <TbArrowRight className='bs-4 is-4' />
                </>
              ) : (
                <Trans
                  i18nKey={
                    paymentType === 'recurring' ? 'dashboard:visitPortalButton' : 'dashboard:downloadReceiptButton'
                  }
                />
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  )
}

export default BillingDetails
