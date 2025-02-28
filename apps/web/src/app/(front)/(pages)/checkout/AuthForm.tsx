// React Imports
import { useEffect, useState, useTransition } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'

// Third-party Imports
import { useForm } from 'react-hook-form'
import { Input } from '@repo/ui/components/ui/input'
import { zodResolver } from '@hookform/resolvers/zod'
import { usePasswordSignUp } from '@repo/auth/sign-up'
import { Button } from '@repo/ui/components/ui/button'
import OauthProviders from '@repo/ui/providers/OauthProviders'
import { TbAlertTriangle, TbCircleCheck } from 'react-icons/tb'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import PasswordInput from '@repo/ui/components/ui/password-input'
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/ui/alert'
import { passwordSignInFormSchema, usePasswordSignIn } from '@repo/auth/sign-in'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { PasswordSignInFormData } from '@repo/auth/sign-in'
import type { PasswordSignUpFormData } from '@repo/auth/sign-up'
import type { User } from '@supabase/supabase-js'

// Config Imports
import authConfig from '@configs/authConfig'

const AuthForm = ({ users }: { users: User[] | null }) => {
  // States
  const [showAlert, setShowAlert] = useState(false)
  const [pending, startTransition] = useTransition()

  // Hooks
  const { t } = useTranslation()
  const router = useRouter()

  // Vars
  const form = useForm<PasswordSignInFormData>({
    resolver: zodResolver(passwordSignInFormSchema(t)),
    defaultValues: {
      email: '',
      password: ''
    }
  })

  const { handleSignIn, error: singInError } = usePasswordSignIn(`/auth/verify-email?email=${form.getValues('email')}`)

  const {
    handleSignUp,
    error: singUpError,
    isSuccess: isSignUpSuccess
  } = usePasswordSignUp({
    emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/checkout`,
    verifyEmailRedirectTo: `/auth/verify-email?email=${form.getValues('email')}`
  })

  const onAuthSubmit = (formData: PasswordSignInFormData | PasswordSignUpFormData) => {
    startTransition(async () => {
      try {
        setShowAlert(false)

        if (formData.email === users?.find(user => user.email === formData.email)?.email) {
          await handleSignIn(formData, users, '').then(() => router.refresh())
        } else {
          await handleSignUp(formData as PasswordSignUpFormData, users).then(() => router.refresh())
        }
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
    <Form {...form}>
      <h3 className='text-textPrimary self-start text-xl font-semibold'>
        <Trans i18nKey='front-pages:enterDetailsText' />
      </h3>
      <Card>
        <CardContent className='pbs-6 flex flex-col gap-4'>
          {showAlert && (
            <Alert variant='tonalDestructive'>
              <TbAlertTriangle className='is-6 bs-6' />
              <AlertTitle>
                <Trans i18nKey='front-pages:checkoutErrorTitle' />
              </AlertTitle>
              <AlertDescription>
                {(singInError as unknown) === 'Invalid login credentials' ? (
                  <Trans i18nKey='front-pages:checkoutInvalidCredentials' />
                ) : (singUpError as unknown) === 'User already registered' ? (
                  <Trans i18nKey='front-pages:checkoutUserExists' />
                ) : (
                  <Trans i18nKey='front-pages:checkoutGenericError' />
                )}
              </AlertDescription>
            </Alert>
          )}
          {isSignUpSuccess ? (
            <Alert variant='tonalSuccess'>
              <TbCircleCheck className='is-6 bs-6' />
              <AlertTitle>
                <Trans i18nKey='front-pages:checkoutSignUpSuccessTitle' />
              </AlertTitle>
              <AlertDescription>
                <Trans i18nKey='front-pages:checkoutSignUpSuccessDesc' />
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <form onSubmit={form.handleSubmit(onAuthSubmit)} className='flex flex-col gap-4'>
                <FormField
                  control={form.control}
                  name='email'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <Trans i18nKey='front-pages:emailAddressLabel' />
                        <sup className='text-destructive'>*</sup>
                      </FormLabel>
                      <FormControl>
                        <Input type='email' placeholder={t('front-pages:emailPlaceholderText')} autoFocus {...field} />
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
                        <Trans i18nKey='front-pages:checkoutPasswordLabel' />
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
                    <Trans i18nKey='front-pages:checkoutSubmitPending' />
                  ) : (
                    <Trans i18nKey='front-pages:checkoutSubmitButton' />
                  )}
                </Button>
              </form>
              <div className='flex items-center gap-4'>
                <hr className='flex-1' />
                <span className='text-textPrimary text-base'>
                  <Trans i18nKey='front-pages:checkoutOrDivider' />
                </span>
                <hr className='flex-1' />
              </div>
              <OauthProviders
                providers={authConfig.providers.oAuth}
                redirectTo={`${process.env.NEXT_PUBLIC_APP_URL}/checkout`}
              />
            </>
          )}
        </CardContent>
      </Card>
    </Form>
  )
}

export default AuthForm
