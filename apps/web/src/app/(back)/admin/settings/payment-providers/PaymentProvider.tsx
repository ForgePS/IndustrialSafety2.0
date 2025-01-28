'use client'

// React Imports
import { useEffect, useState } from 'react'

// Third-party Imports
import { TbX } from 'react-icons/tb'
import { toast } from 'sonner'

// Third-party Imports
import { Button } from '@repo/ui/components/ui/button'
import { Label } from '@repo/ui/components/ui/label'
import { getPublicPaymentProvider } from '@repo/supabase/clientHelpers'
import { RadioGroup, RadioGroupItem } from '@repo/ui/components/ui/radio-group'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import Trans from '@repo/i18n/Trans'

const PaymentProvidersForm = () => {
  // States
  const [selectedProvider, setSelectedProvider] = useState('')
  const [dbProvider, setDbProvider] = useState('')

  // Functions which set the selected provider and update the database
  const handleSubmit = async (formData: FormData) => {
    setDbProvider(formData?.get('payment_provider') as string)
    setSelectedProvider(formData?.get('payment_provider') as string)

    if (formData.get('payment_provider') !== dbProvider) {
      const { error } = await getPublicPaymentProvider()

      toast.success(<Trans i18nKey='admin:settingsToastSuccess' />, {
        cancel: {
          label: <TbX />,
          onClick: () => {}
        },
        duration: 2000
      })

      if (error) {
        console.error('Error updating data:', error)
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
        const { error } = await getPublicPaymentProvider()

        setDbProvider('stripe') // Set the default value to stripe
        setSelectedProvider('stripe') // Set the default value to stripe

        if (error) {
          console.error('Error updating data:', error)
        }
      }

      if (error) {
        console.error('Error fetching data:', error)
      }
    }

    updateProviderSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <form className='flex flex-col items-start gap-4'>
      <Card className='is-full'>
        <CardHeader>
          <CardTitle>
            <Trans i18nKey='admin:settingsPaymentProvidersTitle' />
          </CardTitle>
        </CardHeader>
        <CardContent>
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
  )
}

export default PaymentProvidersForm
