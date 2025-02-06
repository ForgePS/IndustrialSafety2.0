'use client'

// React Imports
import { useTransition } from 'react'
import type { ReactNode } from 'react'

// Third-party Imports
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { TbAlertTriangle, TbCircleCheck } from 'react-icons/tb'
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/ui/alert'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import PasswordInput from '@repo/ui/components/ui/password-input'
import { Button } from '@repo/ui/components/ui/button'
import { resetPasswordFormSchema, useResetPassword } from '@repo/auth/reset-password'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { ResetPasswordFormData } from '@repo/auth/reset-password'

const ResetPasswordForm = () => {
  // States
  const [pending, startTransition] = useTransition()

  // Hooks
  const { handleResetPassword, isError, isSuccess, error } = useResetPassword()
  const { t } = useTranslation()

  // Vars
  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordFormSchema(t)),
    defaultValues: {
      password: '',
      'confirm-password': ''
    }
  })

  const onSubmit = (formData: ResetPasswordFormData) => {
    startTransition(async () => {
      try {
        await handleResetPassword(formData)
      } catch (error) {
        console.error(error)
      }
    })
  }

  return (
    <>
      {isError && (
        <Alert variant='tonalDestructive'>
          <TbAlertTriangle className='is-6 bs-6' />
          <AlertTitle>
            <Trans i18nKey='auth:resetPasswordError' />
          </AlertTitle>
          <AlertDescription>{error as unknown as ReactNode}</AlertDescription>
        </Alert>
      )}
      {isSuccess ? (
        <Alert variant='tonalSuccess'>
          <TbCircleCheck className='is-6 bs-6' />
          <AlertTitle>
            <Trans i18nKey='auth:resetPasswordSuccess' />
          </AlertTitle>
          <AlertDescription>
            <Trans i18nKey='auth:resetPasswordSuccessDescription' />
          </AlertDescription>
        </Alert>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='flex flex-col gap-4'>
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
                <Trans i18nKey='auth:resetPasswordPendingText' />
              ) : (
                <Trans i18nKey='auth:resetPasswordSubmitButton' />
              )}
            </Button>
          </form>
        </Form>
      )}
    </>
  )
}

export default ResetPasswordForm
