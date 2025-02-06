'use client'

// React Imports
import { useEffect, useState, useTransition } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'

// Third-party Imports
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { TbAlertTriangle, TbCircleCheck } from 'react-icons/tb'
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/ui/alert'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import { Input } from '@repo/ui/components/ui/input'
import { Button } from '@repo/ui/components/ui/button'
import { forgotPasswordFormSchema, useForgotPassword } from '@repo/auth/forgot-password'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { User } from '@supabase/supabase-js'
import type { ForgotPasswordFormData } from '@repo/auth/forgot-password'

const ForgotPasswordForm = ({ users }: { users: User[] | null }) => {
  // States
  const [showAlert, setShowAlert] = useState({ show: false, message: '' })
  const [pending, startTransition] = useTransition()

  // Hooks
  const router = useRouter()
  const { t } = useTranslation()

  const { handleForgotPassword, isSuccess } = useForgotPassword(
    `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`
  )

  // Vars
  const form = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordFormSchema(t)),
    defaultValues: { email: '' }
  })

  const onSubmit = (formData: ForgotPasswordFormData) => {
    startTransition(async () => {
      // Check if user already exists with the email address
      const existingUserData = users?.find(user => user.email === formData.email)

      // If user doesn't exist, show alert that says user doesn't exist
      if (!existingUserData) {
        setShowAlert({
          show: true,
          message: t('auth:forgotPasswordErrorUserNotFound')

          // 'User not found with the provided email address. Please sign up to create an account or try again with a different email address.'
        })

        return
      }

      // If user exists but email is not confirmed, redirect to verify email page
      if (!existingUserData.email_confirmed_at) {
        router.push(`/auth/verify-email?email=${formData.email}`)

        return
      }

      try {
        setShowAlert({ show: false, message: '' })
        await handleForgotPassword(formData)
      } catch (error) {
        console.error(error)
        setShowAlert({ show: true, message: error as string })
      }
    })
  }

  // Reset alert when user starts typing in the form
  useEffect(() => {
    const subscription = form.watch(value => {
      if (value.email) {
        setShowAlert({ show: false, message: '' })
      }
    })

    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.watch])

  return (
    <>
      {showAlert.show && (
        <Alert variant='tonalDestructive'>
          <TbAlertTriangle className='is-6 bs-6' />
          <AlertTitle>
            <Trans i18nKey='auth:forgotPasswordError' />
          </AlertTitle>
          <AlertDescription>{showAlert.message}</AlertDescription>
        </Alert>
      )}
      {isSuccess ? (
        <Alert variant='tonalSuccess'>
          <TbCircleCheck className='is-6 bs-6' />
          <AlertTitle>
            <Trans i18nKey='auth:forgotPasswordSuccess' />
          </AlertTitle>
          <AlertDescription>
            <Trans i18nKey='auth:forgotPasswordSuccessDescription' />
          </AlertDescription>
        </Alert>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='flex flex-col gap-4'>
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
            <Button type='submit' disabled={pending}>
              {pending ? (
                <Trans i18nKey='auth:forgotPasswordSubmitPendingText' />
              ) : (
                <Trans i18nKey='auth:forgotPasswordSubmitButton' />
              )}
            </Button>
          </form>
        </Form>
      )}
    </>
  )
}

export default ForgotPasswordForm
