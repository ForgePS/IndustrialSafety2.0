'use client'

// React Imports
import { useEffect, useState } from 'react'

// Third-party Imports
import { Button } from '@repo/ui/components/ui/button'
import { Label } from '@repo/ui/components/ui/label'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'
import { getPublicPaymentProvider } from '@repo/supabase/clientHelpers'
import { RadioGroup, RadioGroupItem } from '@repo/ui/components/ui/radio-group'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { useTranslation } from 'react-i18next'
import Trans from '@repo/i18n/Trans'

const PaymentProvidersForm = () => {
  // States
  const [selectedProvider, setSelectedProvider] = useState('')
  const [dbProvider, setDbProvider] = useState('')

  // Hooks
  const { t } = useTranslation()
  const supabase = createClient()

  // Functions which set the selected provider and update the database
  const handleSubmit = async (formData: FormData) => {
    const newProvider = formData?.get('payment_provider') as string

    if (newProvider !== dbProvider) {
      try {
        // Update the payment provider
        const { error } = await supabase
          .from('settings_configuration')
          .update({ value: newProvider })
          .eq('key', 'payment_provider')

        if (error) {
          console.error('Error updating payment provider:', error)
          toast('error', t('admin:settingsToastError', { message: error.message }))

          return
        }

        setDbProvider(newProvider)
        setSelectedProvider(newProvider)
        toast('success', t('admin:settingsToastSuccess'))
      } catch (error) {
        console.error('Error updating payment provider:', error)
        toast('error', t('admin:settingsToastError', { message: error }))
      }
    }
  }

  // Fetch the payment provider from the database initially and if any payment provider is not set, set it to stripe
  useEffect(() => {
    const updateProviderSettings = async () => {
      const { data, error } = await getPublicPaymentProvider()

      if (data && data.value) {
        setDbProvider(data.value)
        setSelectedProvider(data.value)
      } else {
        // If no payment provider exists, create one with stripe as default
        const { error } = await supabase
          .from('settings_configuration')
          .insert({ key: 'payment_provider', value: 'stripe' })

        if (error) {
          console.error('Error setting default payment provider:', error)

          return
        }

        setDbProvider('stripe')
        setSelectedProvider('stripe')
      }

      if (error) {
        console.error('Error fetching payment provider:', error)
      }
    }

    updateProviderSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className='flex flex-col gap-y-8'>
      <h1 className='text-textPrimary text-2xl font-bold sm:text-3xl'>
        <Trans i18nKey='admin:settingsPaymentProvidersTitle' />
      </h1>
      <form className='flex flex-col items-start gap-6'>
        <Card className='is-full'>
          <CardContent className='pbs-6'>
            <RadioGroup
              value={selectedProvider}
              name='payment_provider'
              onValueChange={setSelectedProvider}
              className='gap-y-4'
            >
              <div className='flex items-center gap-x-2'>
                <RadioGroupItem value='stripe' id='stripe' size='sm' />
                <div>
                  <Label htmlFor='stripe' className='font-medium'>
                    <Trans i18nKey='admin:settingsPaymentProvidersStripeLabel' />
                  </Label>
                  <p className='text-muted-foreground text-sm'>
                    <Trans i18nKey='admin:settingsPaymentProvidersStripeDescription' />
                  </p>
                </div>
              </div>
              <div className='flex items-center gap-x-2'>
                <RadioGroupItem value='lemon_squeezy' id='lemon_squeezy' size='sm' />
                <div>
                  <Label htmlFor='lemon_squeezy' className='font-medium'>
                    <Trans i18nKey='admin:settingsPaymentProvidersLemonSqueezyLabel' />
                  </Label>
                  <p className='text-muted-foreground text-sm'>
                    <Trans i18nKey='admin:settingsPaymentProvidersLemonSqueezyDescription' />
                  </p>
                </div>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>
        <Button type='submit' formAction={e => handleSubmit(e)}>
          <Trans i18nKey='admin:settingsSaveChanges' />
        </Button>
      </form>
    </div>
  )
}

export default PaymentProvidersForm
