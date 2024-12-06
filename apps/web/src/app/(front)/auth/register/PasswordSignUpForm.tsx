'use client'

// React Imports
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'

// Third-party Imports
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { TbAlertTriangle, TbCircleCheck } from 'react-icons/tb'
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/ui/alert'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import { Input } from '@repo/ui/components/ui/input'
import PasswordInput from '@repo/ui/components/ui/password-input'
import SubmitButton from '@repo/ui/components/SubmitButton'
import { useSignUp } from '@repo/supabase/hooks'
import type { User } from '@supabase/supabase-js'

const formSchema = z
  .object({
    email: z.string().min(1, { message: 'Email address is required.' }).email({
      message: 'Please enter a valid email address.'
    }),
    password: z.string().min(1, { message: 'Password is required.' }).min(8, {
      message: 'Password must be at least 8 characters.'
    }),
    'confirm-password': z.string().min(1, { message: 'Confirm password is required.' }).min(8, {
      message: 'Confirm password must be at least 8 characters.'
    })
  })
  .refine(data => data.password === data['confirm-password'], {
    message: 'Confirm password must match with the password.',
    path: ['confirm-password']
  })

const PasswordSignUpForm = ({ appName, users }: { appName: string; users: User[] | null }) => {
  // States
  const [showAlert, setShowAlert] = useState(false)

  // Hooks
  const router = useRouter()
  const signUpMutation = useSignUp()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
      'confirm-password': ''
    }
  })

  const onSubmit = async (formData: z.infer<typeof formSchema>) => {
    // Check if user already exists with the email address
    const existingUserData = users?.find(user => user.email === formData.email)

    // If user exists but email is not confirmed, redirect to verify email page
    if (existingUserData && !existingUserData.email_confirmed_at) {
      router.push(`/auth/verify-email?email=${formData.email}`)

      return
    }

    try {
      setShowAlert(false)
      await signUpMutation.mutateAsync(formData)
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
            {((signUpMutation.error as unknown) === 'User already registered'
              ? 'User already exists with this email address. Please try again with a different email address or sign in with this email address.'
              : (signUpMutation.error as unknown as ReactNode)) ??
              'An error occurred while signing up. Please try again later.'}
          </AlertDescription>
        </Alert>
      )}
      {signUpMutation.isSuccess ? (
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
