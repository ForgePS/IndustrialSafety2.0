'use client'

// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { TbAlertTriangle, TbCircleCheck } from 'react-icons/tb'
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/ui/alert'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import PasswordInput from '@repo/ui/components/ui/password-input'
import SubmitButton from '@repo/ui/components/SubmitButton'
import { resetPasswordFormSchema, useResetPassword } from '@repo/auth/reset-password'
import type { ResetPasswordFormData } from '@repo/auth/reset-password'

const ResetPasswordForm = () => {
  // Hooks
  const { handleResetPassword, isError, isSuccess, error } = useResetPassword()

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: {
      password: '',
      'confirm-password': ''
    }
  })

  const onSubmit = async (formData: ResetPasswordFormData) => {
    try {
      await handleResetPassword(formData)
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <>
      {isError && (
        <Alert variant='tonalDestructive'>
          <TbAlertTriangle className='is-6 bs-6' />
          <AlertTitle>Password Reset Failed</AlertTitle>
          <AlertDescription>{error as unknown as ReactNode}</AlertDescription>
        </Alert>
      )}
      {isSuccess ? (
        <Alert variant='tonalSuccess'>
          <TbCircleCheck className='is-6 bs-6' />
          <AlertTitle>Password Reset Successful</AlertTitle>
          <AlertDescription>Your password has been successfully updated.</AlertDescription>
        </Alert>
      ) : (
        <Form {...form}>
          <form className='flex flex-col gap-4'>
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
            <SubmitButton formAction={form.handleSubmit(onSubmit) as any} pendingText='Setting new password...'>
              Set new password
            </SubmitButton>
          </form>
        </Form>
      )}
    </>
  )
}

export default ResetPasswordForm
