'use client'

// React Imports
import { useEffect, useState, useTransition } from 'react'
import type { ReactNode } from 'react'

// Next Imports
import Link from 'next/link'

// Third-party Imports
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { TbAlertTriangle } from 'react-icons/tb'
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/ui/alert'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import PasswordInput from '@repo/ui/components/ui/password-input'
import { passwordSignInFormSchema, usePasswordSignIn } from '@repo/auth/sign-in'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { User } from '@supabase/supabase-js'
import type { PasswordSignInFormData } from '@repo/auth/sign-in'

// Config Imports
import appConfig from '@configs/appConfig'

const PasswordSignInForm = ({ users }: { users: User[] | null }) => {
  // States
  const [showAlert, setShowAlert] = useState(false)
  const [pending, startTransition] = useTransition()

  // Hooks
  const { t } = useTranslation()

  // Vars
  const form = useForm<PasswordSignInFormData>({
    resolver: zodResolver(passwordSignInFormSchema(t)),
    defaultValues: {
      email: '',
      password: ''
    }
  })

  const { handleSignIn, error } = usePasswordSignIn(`/auth/verify-email?email=${form.getValues('email')}`)

  const handleButtonClick = (value: string) => {
    form.setValue('email', value === 'admin' ? 'admin@jetship.com' : 'user@jetship.com')
    form.setValue('password', value === 'admin' ? 'adminpassword' : 'userpassword')
  }

  const onSubmit = (formData: PasswordSignInFormData) => {
    startTransition(async () => {
      try {
        setShowAlert(false)
        await handleSignIn(formData, users)
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
            <Trans i18nKey='auth:loginError' />
          </AlertTitle>
          <AlertDescription>
            {((error as unknown) === 'Invalid login credentials' ? (
              <Trans i18nKey='auth:loginErrorCredentials' />
            ) : (
              (error as unknown as ReactNode)
            )) ?? <Trans i18nKey='auth:loginErrorDescription' />}
          </AlertDescription>
        </Alert>
      )}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='flex flex-col gap-4'>
          <div className='mbe-2 flex flex-wrap gap-6 sm:flex-nowrap lg:flex-wrap xl:flex-nowrap'>
            <Button type='button' variant='outline' className='is-full' onClick={() => handleButtonClick('user')}>
              <Trans i18nKey='auth:loginTestUserButton' />
            </Button>
            <Button type='button' variant='outline' className='is-full' onClick={() => handleButtonClick('admin')}>
              <Trans i18nKey='auth:loginTestAdminButton' />
            </Button>
          </div>
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
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <Link href='/auth/forgot-password' className='text-primary'>
              <Trans i18nKey='auth:authForgotPasswordText' />?
            </Link>
          </div>
          <Button type='submit' disabled={pending}>
            {pending ? (
              <Trans i18nKey='auth:loginSubmitPendingText' values={{ appName: appConfig.appName }} />
            ) : (
              <Trans i18nKey='auth:loginText' values={{ appName: appConfig.appName }} />
            )}
          </Button>
        </form>
      </Form>
    </>
  )
}

export default PasswordSignInForm
