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
import type { MagicLinkFormData } from '@repo/auth/sign-in'

const MagicLinkForm = () => {
  // Hooks
  const { handleSignIn, isError, isSuccess, error } = useMagicLinkSignIn(
    `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard`
  )

  const form = useForm<MagicLinkFormData>({
    resolver: zodResolver(magicLinkFormSchema),
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
          <AlertTitle>Magic Link Not Sent</AlertTitle>
          <AlertDescription>{error as unknown as ReactNode}</AlertDescription>
        </Alert>
      )}
      {isSuccess ? (
        <Alert variant='tonalSuccess'>
          <TbCircleCheck className='is-6 bs-6' />
          <AlertTitle>Magic Link Sent</AlertTitle>
          <AlertDescription>
            A magic link has been sent to your email address. Please check your inbox to continue the sign-in process.
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
            <SubmitButton
              formAction={form.handleSubmit(onSubmit) as any}
              pendingText={
                <>
                  <TbMail className='is-5 bs-5' />
                  <span>Sending a magic link...</span>
                </>
              }
            >
              <TbMail className='is-5 bs-5' />
              <span>Send a magic link</span>
            </SubmitButton>
          </form>
        </Form>
      )}
    </>
  )
}

export default MagicLinkForm
