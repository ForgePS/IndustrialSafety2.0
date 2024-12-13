'use client'

// React Imports
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

// Third-party Imports
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { TbAlertTriangle, TbCircleCheck } from 'react-icons/tb'
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/ui/alert'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import { Input } from '@repo/ui/components/ui/input'
import PasswordInput from '@repo/ui/components/ui/password-input'
import SubmitButton from '@repo/ui/components/SubmitButton'
import { passwordSignUpFormSchema, usePasswordSignUp } from '@repo/auth/sign-up'
import type { User } from '@supabase/supabase-js'
import type { PasswordSignUpFormData } from '@repo/auth/sign-up'

const PasswordSignUpForm = ({ appName, users }: { appName: string; users: User[] | null }) => {
  // States
  const [showAlert, setShowAlert] = useState(false)

  // Hooks
  const form = useForm<PasswordSignUpFormData>({
    resolver: zodResolver(passwordSignUpFormSchema),
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

  const onSubmit = async (formData: PasswordSignUpFormData) => {
    try {
      setShowAlert(false)
      await handleSignUp(formData, users)
    } catch (error) {
      console.error(error)
      setShowAlert(true)
    }
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
          <AlertTitle>Sign Up Failed</AlertTitle>
          <AlertDescription>
            {((error as unknown) === 'User already registered'
              ? 'User already exists with this email address. Please try again with a different email address or sign in with this email address.'
              : (error as unknown as ReactNode)) ?? 'An error occurred while signing up. Please try again later.'}
          </AlertDescription>
        </Alert>
      )}
      {isSuccess ? (
        <Alert variant='tonalSuccess'>
          <TbCircleCheck className='is-6 bs-6' />
          <AlertTitle>Sign Up Successful</AlertTitle>
          <AlertDescription>
            {`You have successfully signed up to ${appName}. Please check and verify your email.`}
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
                    Email address<sup className='text-destructive'>*</sup>
                  </FormLabel>
                  <FormControl>
                    <Input type='email' placeholder='Enter your email address' autoFocus {...field} />
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
                    Password<sup className='text-destructive'>*</sup>
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
                    Confirm Password<sup className='text-destructive'>*</sup>
                  </FormLabel>
                  <FormControl>
                    <PasswordInput placeholder='················' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <SubmitButton formAction={form.handleSubmit(onSubmit) as any} pendingText={`Signing Up to ${appName}...`}>
              {`Sign Up to ${appName}`}
            </SubmitButton>
          </form>
        </Form>
      )}
    </>
  )
}

export default PasswordSignUpForm
