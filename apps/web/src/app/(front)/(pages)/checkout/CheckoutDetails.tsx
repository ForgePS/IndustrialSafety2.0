'use client'

// React Imports
import { useState, useEffect } from 'react'
import type { ChangeEvent } from 'react'

// Next Imports
import Link from 'next/link'

// Third-party Imports
import { cn } from '@repo/ui/lib/utils'
import { TbCircleCheck } from 'react-icons/tb'
import { loadStripe } from '@stripe/stripe-js'
import { Skeleton } from '@repo/ui/components/ui/skeleton'
import SubmitButton from '@repo/ui/components/SubmitButton'
import { RadioGroup } from '@repo/ui/components/ui/radio-group'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import CustomInputHorizontal from '@repo/ui/components/custom-inputs/Horizontal'
import { createCheckoutSession, fetchCheckoutData } from '@repo/billing/src/actions'
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@repo/ui/components/ui/dialog'
import { createClient } from '@repo/supabase/client'
import type { CustomInputHorizontalData } from '@repo/ui/components/custom-inputs/types'
import type { User } from '@supabase/supabase-js'
import type { Database } from '@repo/supabase/types'
import type { Plan, PlanVariant } from '@repo/billing/src/types/billingConfigTypes'

// Component Imports
import AuthForm from './AuthForm'
import Logo from '@components/layout/front/Logo'

// Styles Imports
import frontCommonStyles from '../styles.module.css'

type Props = {
  paymentProvider: Database['public']['Enums']['billing_provider_enum']
  userRecord: User | null
  appName: string
  users: User[] | null
}

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const CheckoutDetails = ({ paymentProvider, userRecord, appName, users }: Props) => {
  // States
  const [selected, setSelected] = useState<string>(paymentProvider) // Default selected value is the payment provider (Stripe or Lemon Squeezy)
  const [variantDetails, setVariantDetails] = useState<PlanVariant | null>(null) // For selected variant details (plan variant)
  const [planDetails, setPlanDetails] = useState<Plan | null>(null) // For selected plan details
  const [stripeClientSecret, setStripeClientSecret] = useState('') // For stripe client secret
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const onSubmit = async (planId: string) => {
    const supabase = createClient()

    // Insert billing record into the database with status as pending
    const { error } = await supabase.from('billing').insert({
      user_id: userRecord?.id,
      email: userRecord?.email,
      billing_provider: paymentProvider,
      status: 'pending',
      order_type: variantDetails?.paymentType === 'recurring' ? 'subscription' : 'one-off',
      plan_variant: variantDetails?.name,
      interval: variantDetails?.paymentType === 'recurring' ? variantDetails?.interval : null,
      cost: variantDetails?.lineItems[0].cost,
      currency: planDetails?.currency
    })

    if (error) {
      console.error('Error inserting data:', error)

      return
    }

    // @ts-ignore
    paymentProvider === 'lemon_squeezy' && window.createLemonSqueezy()

    // Create a checkout session
    const response = await createCheckoutSession(
      planId,
      variantDetails as PlanVariant,
      paymentProvider,
      userRecord as User,
      window.location.href
    )

    if (paymentProvider === 'lemon_squeezy') {
      if (response.checkoutUrl) {
        // @ts-ignore
        window.LemonSqueezy.Url.Open(response.checkoutUrl) // Open the checkout window
      }
    } else if (paymentProvider === 'stripe') {
      if (response.clientSecret) {
        setStripeClientSecret(response.clientSecret) // Use the client secret for Stripe
      }
    } else {
      throw new Error('Failed to create checkout session')
    }
  }

  // Function to handle radio button change
  const handleChange = (prop: string | ChangeEvent<HTMLInputElement>) => {
    if (typeof prop === 'string') {
      setSelected(prop)
    } else {
      setSelected((prop.target as HTMLInputElement).value)
    }
  }

  // Function to fetch checkout data from API
  useEffect(() => {
    const fetchData = async () => {
      const response = await fetchCheckoutData()

      if (response.status === 200) {
        setVariantDetails(response.data.selectedVariantDetails)
        setPlanDetails(response.data.selectedPlan)
        setLoading(false)
      }
    }

    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Data for custom input
  const data: CustomInputHorizontalData = {
    content: (
      <div className='is-full'>
        <div className='mbe-1.5 flex items-center gap-4'>
          <h3 className='text-textPrimary text-xl font-semibold'>
            {paymentProvider === 'stripe' ? 'Stripe' : 'Lemon Squeezy'}
          </h3>
          <img
            src={
              paymentProvider === 'stripe' ? '/images/logos/stripe.png' : '/images/logos/lemon-squeezy-transparent.png'
            }
            alt={paymentProvider === 'stripe' ? 'Stripe' : 'Lemon Squeezy'}
            className='is-5'
          />
        </div>
        <p className='text-textSecondary text-base'>You will be redirected to complete your payment.</p>
      </div>
    ),
    value: paymentProvider,
    isSelected: true
  }

  return (
    <div className={cn('plb-20 grid gap-6 sm:gap-12 md:grid-cols-2', frontCommonStyles.layoutSpacing)}>
      <div className='flex flex-col gap-4'>
        {!userRecord && <AuthForm users={users} />}
        <h3 className='text-textPrimary self-start text-xl font-semibold'>Pay With</h3>
        <RadioGroup onValueChange={handleChange}>
          <CustomInputHorizontal
            type='radio'
            data={data}
            selected={selected as string}
            handleChange={handleChange}
            className='bg-card flex-row-reverse items-center gap-6 p-6'
          />
        </RadioGroup>
        <p className='text-textDisabled text-base'>
          By continuing, you agree to our{' '}
          <Link href='/terms-of-service' className='text-primary' onClick={e => e.preventDefault()}>
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href='/privacy-policy' className='text-primary' onClick={e => e.preventDefault()}>
            Privacy Policy
          </Link>
          .
        </p>

        {paymentProvider === 'lemon_squeezy' ? (
          <form>
            <SubmitButton
              formAction={() => onSubmit(variantDetails?.lineItems[0].priceId as string)}
              className='bg-primary is-full'
              pendingText='Processing...'
              disabled={!userRecord}
            >
              Confirm & Pay
            </SubmitButton>
          </form>
        ) : (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTitle hidden />
            <DialogDescription hidden />
            <form>
              <DialogTrigger asChild>
                <SubmitButton
                  formAction={() => onSubmit(variantDetails?.lineItems[0].priceId as string)}
                  className='bg-primary is-full'
                  pendingText='Processing...'
                  disabled={!userRecord}
                >
                  Confirm & Pay
                </SubmitButton>
              </DialogTrigger>
            </form>
            {/* Stripe Checkout Dialog Content */}
            <DialogContent className='sm:max-is-[425px] bs-full max-bs-[calc(100vh-8rem)] overflow-auto'>
              {stripeClientSecret && (
                <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret: stripeClientSecret }}>
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className='flex flex-col gap-4'>
        <h3 className='text-textPrimary self-start text-xl font-semibold'>Plan Details</h3>
        {loading ? (
          <>
            <Skeleton className='is-full bs-96' />
          </>
        ) : (
          <Card>
            <CardContent className='pbs-6 flex flex-col gap-4'>
              <Logo appName={appName} />
              <p className='text-textSecondary text-sm'>{variantDetails?.description}</p>
              <hr />
              <p className='text-textPrimary text-base font-semibold'>{variantDetails?.name}</p>
              <ul className='space-b-1.5'>
                {variantDetails?.paymentType === 'recurring'
                  ? planDetails?.features?.map((feature, index) => (
                      <li key={index} className='flex gap-4'>
                        <TbCircleCheck className='text-primary min-is-fit text-xl' />
                        <span className='text-textPrimary text-sm'>{feature}</span>
                      </li>
                    ))
                  : variantDetails?.features?.map((feature, index) => (
                      <li key={index} className='flex gap-4'>
                        <TbCircleCheck className='text-primary min-is-fit text-xl' />
                        <span className='text-textPrimary text-sm'>{feature}</span>
                      </li>
                    ))}
              </ul>
              <hr />
              <div className='flex items-center justify-between gap-4'>
                <span className='text-textPrimary text-base font-semibold'>Quantity</span>
                <span className='text-textPrimary text-base font-semibold'>1</span>
              </div>
              <hr />
              <div className='flex items-center justify-between gap-4'>
                <span className='text-textPrimary text-base font-semibold'>Price</span>
                <span className='text-textPrimary text-base font-semibold'>{`$${variantDetails?.lineItems[0].cost.toFixed(2)}`}</span>
              </div>
              {/* Add discount related code here : conditionally */}
              <hr />
              <div className='flex items-center justify-between gap-4'>
                <span className='text-primary text-xl font-semibold'>Pay now</span>
                <span className='text-primary text-base font-semibold'>{`$${variantDetails?.lineItems[0].cost.toFixed(2)}`}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export default CheckoutDetails
