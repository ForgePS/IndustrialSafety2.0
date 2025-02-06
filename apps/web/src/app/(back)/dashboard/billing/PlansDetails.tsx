'use client'

// React Imports
import { useEffect, useState, useTransition } from 'react'
import type { ChangeEvent } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'

// Third-party Imports
import { TbCircleCheck } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { saveCheckoutData } from '@repo/billing/src/actions'
import { RadioGroup } from '@repo/ui/components/ui/radio-group'
import CustomInputHorizontal from '@repo/ui/components/custom-inputs/Horizontal'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@repo/ui/components/ui/card'
import Trans from '@repo/i18n/Trans'
import type { PlanVariant, Plan } from '@repo/billing/src/types/billingConfigTypes'

const PlansDetails = ({ planData }: { planData: Plan[] }) => {
  // States
  const [billingInterval, setBillingInterval] = useState<PlanVariant['interval']>('monthly')
  const [selectedVariant, setSelectedVariant] = useState<string>('')
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [selectedVariantDetails, setSelectedVariantDetails] = useState<PlanVariant | null>(null)
  const [pending, startTransition] = useTransition()

  // Hooks
  const router = useRouter()

  // Handle the change of billing interval (monthly/yearly)
  const handleIntervalChange = (prop: string | ChangeEvent<HTMLInputElement>) => {
    const newInterval = typeof prop === 'string' ? prop : (prop.target as HTMLInputElement).value

    setBillingInterval(newInterval as PlanVariant['interval'])

    // Automatically select the first plan that matches the new billing interval
    const firstVariant =
      planData &&
      planData.map(plan =>
        plan.variants.find(variant => variant.paymentType === 'recurring' && variant.interval === newInterval)
      )[0]

    if (firstVariant) {
      setSelectedVariant(firstVariant.id)
      setSelectedPlan(planData.find(plan => plan.variants.some(variant => variant.id === firstVariant.id))!)
      setSelectedVariantDetails(firstVariant)
    }
  }

  // Handle the change of selected plan
  const handlePlanChange = (prop: string | ChangeEvent<HTMLInputElement>) => {
    const planId = typeof prop === 'string' ? prop : (prop.target as HTMLInputElement).value

    setSelectedVariant(planId)
    const newSelectedPlan = planData?.find(plan => plan.variants.some(variant => variant.id === planId))

    if (newSelectedPlan) {
      setSelectedPlan(newSelectedPlan)
      const planDetails = newSelectedPlan.variants.find(variant => variant.id === planId)

      setSelectedVariantDetails(planDetails!)
    }
  }

  // Submit the selected plan and variant data
  const handleSubmit = () => {
    startTransition(async () => {
      // Send data to the API route
      const response = await saveCheckoutData({ selectedVariantDetails, selectedPlan })

      if (response.status === 200) {
        router.push('/checkout')
      } else {
        console.error('Failed to save data')
      }
    })
  }

  // Set the initial selected plan & variant
  useEffect(() => {
    setSelectedPlan(planData[0])
    setSelectedVariant(
      planData[0].variants[0].paymentType === 'recurring'
        ? planData[0].variants.find(variant => variant.interval === 'monthly')!.id
        : planData[0].variants[0].id
    )
    setSelectedVariantDetails(
      planData[0].variants[0].paymentType === 'recurring'
        ? planData[0].variants.find(variant => variant.interval === 'monthly')!
        : planData[0].variants[0]
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-xl font-medium'>
          <Trans i18nKey='dashboard:plansTitle' />
        </CardTitle>
        <CardDescription>
          <Trans i18nKey='dashboard:plansDescription' />
        </CardDescription>
      </CardHeader>
      {planData?.length !== 0 && (
        <CardContent className='grid gap-6 md:grid-cols-2'>
          <div>
            {/* Conditionally render based on the variant type (recurring/one-off) */}
            {selectedPlan?.variants[0].paymentType === 'recurring' ? (
              <>
                <div className='mb-4 rounded-md border p-4'>
                  <h6 className='mb-3 text-base font-medium'>
                    <Trans i18nKey='dashboard:billingIntervalTitle' />
                  </h6>
                  <RadioGroup onValueChange={handleIntervalChange} className='flex flex-wrap items-center gap-4'>
                    {['monthly', 'yearly'].map((interval, index) => (
                      <CustomInputHorizontal
                        key={index}
                        type='radio'
                        data={{
                          title: `Billed ${interval}`,
                          value: interval,
                          isSelected: billingInterval === interval
                        }}
                        selected={billingInterval as string}
                        handleChange={handleIntervalChange}
                      />
                    ))}
                  </RadioGroup>
                </div>
                <h6 className='mb-3 text-sm font-medium'>
                  <Trans i18nKey='dashboard:pickPlanTitle' />
                </h6>
                <RadioGroup onValueChange={handlePlanChange}>
                  {planData?.map(plan =>
                    plan.variants
                      .filter(variant => variant.paymentType === 'recurring' && variant.interval === billingInterval)
                      .map((variant, index) => (
                        <CustomInputHorizontal
                          key={index}
                          type='radio'
                          data={{
                            content: (
                              <div className='flex w-full items-center justify-between'>
                                <div>
                                  <h3 className='text-textPrimary mb-1 text-base font-medium'>{variant.name}</h3>
                                  <p className='text-textSecondary text-sm'>{plan.description}</p>
                                </div>
                                <div>
                                  <h3 className='text-textPrimary mb-1 text-base font-medium'>
                                    ${variant.lineItems[0].cost}
                                  </h3>
                                  <p className='text-textSecondary text-sm'>{billingInterval}</p>
                                </div>
                              </div>
                            ),
                            value: variant.id,
                            isSelected: selectedVariant === variant.id
                          }}
                          selected={selectedVariant}
                          handleChange={handlePlanChange}
                          className='items-center'
                        />
                      ))
                  )}
                </RadioGroup>
              </>
            ) : (
              <>
                <h6 className='mb-3 text-sm font-medium'>
                  <Trans i18nKey='dashboard:pickPlanTitle' />
                </h6>
                <RadioGroup onValueChange={handlePlanChange}>
                  {planData?.map(plan =>
                    plan.variants
                      .filter(variant => variant.paymentType === 'one-off')
                      .map((variant, index) => (
                        <CustomInputHorizontal
                          key={index}
                          type='radio'
                          data={{
                            content: (
                              <div className='flex w-full items-center justify-between gap-3'>
                                <div>
                                  <h3 className='text-textPrimary mb-1 text-base font-medium'>{variant.name}</h3>
                                  <p className='text-textSecondary text-sm'>{variant.description}</p>
                                </div>
                                <div>
                                  <h3 className='text-textPrimary mb-1 text-base font-medium'>
                                    ${variant.lineItems[0].cost}
                                  </h3>
                                  <p className='text-textSecondary text-sm'>
                                    <Trans i18nKey='dashboard:payOnceText' />
                                  </p>
                                </div>
                              </div>
                            ),
                            value: variant.id,
                            isSelected: selectedVariant === variant.id
                          }}
                          selected={selectedVariant}
                          handleChange={handlePlanChange}
                          className='items-center'
                        />
                      ))
                  )}
                </RadioGroup>
              </>
            )}
          </div>
          <div>
            <h3 className='text-textPrimary mb-2 text-base font-medium'>
              {selectedVariantDetails?.name} /{' '}
              {selectedVariantDetails?.paymentType === 'recurring' ? (
                `Billed ${billingInterval}`
              ) : (
                <Trans i18nKey='dashboard:payOnceText' />
              )}
            </h3>
            <p className='text-textSecondary text-sm'>{selectedVariantDetails?.description}</p>
            <hr className='my-4' />
            <h3 className='text-textPrimary mb-2 text-base font-medium'>
              <Trans i18nKey='dashboard:detailsTitle' />
            </h3>
            <p className='text-textSecondary text-sm'>
              <Trans i18nKey='dashboard:basePlanText' /> (
              {selectedVariantDetails?.paymentType === 'recurring' ? (
                `Billed ${billingInterval}`
              ) : (
                <Trans i18nKey='dashboard:payOnceText' />
              )}
              ) - ${selectedVariantDetails?.lineItems[0].cost}
            </p>
            <hr className='my-4' />
            <h3 className='text-textPrimary mb-2 text-base font-medium'>
              <Trans i18nKey='dashboard:featuresTitle' />
            </h3>
            <ul className='space-y-2'>
              {selectedVariantDetails?.paymentType === 'recurring'
                ? selectedPlan?.features?.map((feature, index) => (
                    <li key={index} className='flex items-center gap-2'>
                      <TbCircleCheck className='text-primary min-w-fit text-xl' />
                      <span className='text-textSecondary text-sm'>{feature}</span>
                    </li>
                  ))
                : selectedVariantDetails?.features?.map((feature, index) => (
                    <li key={index} className='flex items-center gap-2'>
                      <TbCircleCheck className='text-primary min-w-fit text-xl' />
                      <span className='text-textSecondary text-sm'>{feature}</span>
                    </li>
                  ))}
            </ul>
            <form action={handleSubmit}>
              <Button type='submit' disabled={pending} className='mt-6 bg-indigo-600 text-white hover:bg-indigo-700'>
                {pending ? (
                  <Trans i18nKey='dashboard:processingText' />
                ) : (
                  <Trans i18nKey='dashboard:proceedToPaymentButton' />
                )}
              </Button>
            </form>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

export default PlansDetails
