'use client'

// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { TbAlertTriangle, TbCircleCheck, TbMail } from 'react-icons/tb'
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/ui/alert'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import { Input } from '@repo/ui/components/ui/input'
import SubmitButton from '@repo/ui/components/SubmitButton'
import { magicLinkFormSchema, useMagicLinkSignIn } from '@repo/auth/sign-in'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { MagicLinkFormData } from '@repo/auth/sign-in'

const MagicLinkForm = () => {
  // Hooks
  const { t } = useTranslation()

  const { handleSignIn, isError, isSuccess, error } = useMagicLinkSignIn(
    `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard`
  )

  const form = useForm<MagicLinkFormData>({
    resolver: zodResolver(magicLinkFormSchema(t)),
    defaultValues: { email: '' }
  })

  const onSubmit = async (formData: MagicLinkFormData) => {
    try {
      await handleSignIn(formData)
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <>
      {isError && (
        <Alert variant='tonalDestructive'>
          <TbAlertTriangle className='is-6 bs-6' />
          <AlertTitle>
            <Trans i18nKey='auth:magicLinkError' />
          </AlertTitle>
          <AlertDescription>{error as unknown as ReactNode}</AlertDescription>
        </Alert>
      )}
      {isSuccess ? (
        <Alert variant='tonalSuccess'>
          <TbCircleCheck className='is-6 bs-6' />
          <AlertTitle>
            <Trans i18nKey='auth:magicLinkSuccess' />
          </AlertTitle>
          <AlertDescription>
            <Trans i18nKey='auth:magicLinkSuccessDescription' />
          </AlertDescription>
        </Alert>
      ) : (
        <Form {...form}>
          <form className='flex flex-col gap-4'>
            <FormField
              control={form.control}
              name='email'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <Trans i18nKey='auth:formEmailLabel' />
                    <sup className='text-destructive'>*</sup>
                  </FormLabel>
                  <FormControl>
                    <Input type='email' placeholder={t('auth:formEmailPlaceholder')} autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <SubmitButton
              formAction={form.handleSubmit(onSubmit) as any}
              pendingText={
                <>
                  <TbMail className='is-5 bs-5' />
                  <span>
                    <Trans i18nKey='auth:magicLinkSubmitPendingText' />
                  </span>
                </>
              }
            >
              <TbMail className='is-5 bs-5' />
              <span>
                <Trans i18nKey='auth:magicLinkSubmitButton' />
              </span>
            </SubmitButton>
          </form>
        </Form>
      )}
    </>
  )
}

export default MagicLinkForm
