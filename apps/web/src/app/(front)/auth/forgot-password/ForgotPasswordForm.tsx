'use client'

// React Imports
import { useEffect, useState } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'

// Third-party Imports
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { TbAlertTriangle, TbCircleCheck } from 'react-icons/tb'
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/ui/alert'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import { Input } from '@repo/ui/components/ui/input'
import SubmitButton from '@repo/ui/components/SubmitButton'
import { forgotPasswordFormSchema, useForgotPassword } from '@repo/auth/forgot-password'
import type { User } from '@supabase/supabase-js'
import type { ForgotPasswordFormData } from '@repo/auth/forgot-password'

const ForgotPasswordForm = ({ users }: { users: User[] | null }) => {
  // States
  const [showAlert, setShowAlert] = useState({ show: false, message: '' })

  // Hooks
  const router = useRouter()

  const { handleForgotPassword, isSuccess } = useForgotPassword(
    `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`
  )

  const form = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: { email: '' }
  })

  const onSubmit = async (formData: ForgotPasswordFormData) => {
    // Check if user already exists with the email address
    const existingUserData = users?.find(user => user.email === formData.email)

    // If user doesn't exist, show alert that says user doesn't exist
    if (!existingUserData) {
      setShowAlert({
        show: true,
        message:
          'The email address you entered does not exist in our records. Please check the email address and try again.'

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
          <AlertTitle>Reset Link Not Sent</AlertTitle>
          <AlertDescription>{showAlert.message}</AlertDescription>
        </Alert>
      )}
      {isSuccess ? (
        <Alert variant='tonalSuccess'>
          <TbCircleCheck className='is-6 bs-6' />
          <AlertTitle>Reset Link Sent</AlertTitle>
          <AlertDescription>
            We have sent a reset link to your email address. Please check your inbox to reset your password.
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
            <SubmitButton formAction={form.handleSubmit(onSubmit) as any} pendingText='Sending Reset Link...'>
              Send Reset Link
            </SubmitButton>
          </form>
        </Form>
      )}
    </>
  )
}

export default ForgotPasswordForm
