'use client'

// React Imports
import { useEffect, useState, useTransition } from 'react'
import type { ReactNode } from 'react'

// Third-party Imports
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { TbAlertTriangle, TbCircleCheck } from 'react-icons/tb'
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/ui/alert'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import { Input } from '@repo/ui/components/ui/input'
import PasswordInput from '@repo/ui/components/ui/password-input'
import { Button } from '@repo/ui/components/ui/button'
import { passwordSignUpFormSchema, usePasswordSignUp } from '@repo/auth/sign-up'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { User } from '@supabase/supabase-js'
import type { PasswordSignUpFormData } from '@repo/auth/sign-up'

const PasswordSignUpForm = ({ appName, users }: { appName: string; users: User[] | null }) => {
  // States
  const [showAlert, setShowAlert] = useState(false)
  const [pending, startTransition] = useTransition()

  // Hooks
  const { t } = useTranslation()

  // Vars
  const form = useForm<PasswordSignUpFormData>({
    resolver: zodResolver(passwordSignUpFormSchema(t)),
    defaultValues: {
      email: '',
      password: '',
      'confirm-password': ''
    }
  })

  const { handleSignUp, error, isSuccess } = usePasswordSignUp({
    emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard`,
    verifyEmailRedirectTo: `/auth/verify-email?email=${form.getValues('email')}`
  })

  const onSubmit = (formData: PasswordSignUpFormData) => {
    startTransition(async () => {
      try {
        setShowAlert(false)
        await handleSignUp(formData, users)
      } catch (error) {
        console.error(error)
        setShowAlert(true)
      }
    })
  }

  // Reset alert when user starts typing in the form
  useEffect(() => {
    const subscription = form.watch(value => {
      if (value.email) {
        setShowAlert(false)
      }
    })

    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.watch])

  return (
    <>
      {showAlert && (
        <Alert variant='tonalDestructive'>
          <TbAlertTriangle className='is-6 bs-6' />
          <AlertTitle>
            <Trans i18nKey='auth:registerSignUpError' />
          </AlertTitle>
          <AlertDescription>
            {((error as unknown) === 'User already registered' ? (
              <Trans i18nKey='auth:registerSignUpErrorUserExists' />
            ) : (
              (error as unknown as ReactNode)
            )) ?? <Trans i18nKey='auth:registerSignUpErrorDescription' />}
          </AlertDescription>
        </Alert>
      )}
      {isSuccess ? (
        <Alert variant='tonalSuccess'>
          <TbCircleCheck className='is-6 bs-6' />
          <AlertTitle>
            <Trans i18nKey='auth:registerSignUpSuccess' />
          </AlertTitle>
          <AlertDescription>
            <Trans i18nKey='auth:registerSignUpSuccessDescription' values={{ appName }} />
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
            <FormField
              control={form.control}
              name='password'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <Trans i18nKey='auth:formPasswordLabel' />
                    <sup className='text-destructive'>*</sup>
                  </FormLabel>
                  <FormControl>
                    <PasswordInput placeholder='················' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='confirm-password'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <Trans i18nKey='auth:formPasswordConfirmLabel' />
                    <sup className='text-destructive'>*</sup>
                  </FormLabel>
                  <FormControl>
                    <PasswordInput placeholder='················' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type='submit' disabled={pending}>
              {pending ? (
                <Trans i18nKey='auth:registerSubmitPendingText' values={{ appName }} />
              ) : (
                <Trans i18nKey='auth:registerText' values={{ appName }} />
              )}
            </Button>
          </form>
        </Form>
      )}
    </>
  )
}

export default PasswordSignUpForm
