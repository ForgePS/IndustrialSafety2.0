// React Imports
import { useEffect, useState } from 'react'

// Third-party Imports
import { useForm } from 'react-hook-form'
import { Input } from '@repo/ui/components/ui/input'
import { zodResolver } from '@hookform/resolvers/zod'
import { usePasswordSignUp } from '@repo/auth/sign-up'
import SubmitButton from '@repo/ui/components/SubmitButton'
import OauthProviders from '@repo/ui/providers/OauthProviders'
import { TbAlertTriangle, TbCircleCheck } from 'react-icons/tb'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import PasswordInput from '@repo/ui/components/ui/password-input'
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/ui/alert'
import { passwordSignInFormSchema, usePasswordSignIn } from '@repo/auth/sign-in'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import type { PasswordSignInFormData } from '@repo/auth/sign-in'
import type { PasswordSignUpFormData } from '@repo/auth/sign-up'
import type { User } from '@supabase/supabase-js'

// Config Imports
import authConfig from '@configs/authConfig'

const AuthForm = ({ users }: { users: User[] | null }) => {
  // States
  const [showAlert, setShowAlert] = useState(false)

  // Hooks
  const form = useForm<PasswordSignInFormData>({
    resolver: zodResolver(passwordSignInFormSchema),
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
    emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/checkout`,
    verifyEmailRedirectTo: `/auth/verify-email?email=${form.getValues('email')}`
  })

  const onAuthSubmit = async (formData: PasswordSignInFormData | PasswordSignUpFormData) => {
    try {
      setShowAlert(false)

      if (formData.email === users?.find(user => user.email === formData.email)?.email) {
        await handleSignIn(formData, users, '')
      } else {
        await handleSignUp(formData as PasswordSignUpFormData, users)
      }
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
    <Form {...form}>
      <h3 className='text-textPrimary self-start text-xl font-semibold'>Enter Your Details</h3>
      <Card>
        <CardContent className='pbs-6 flex flex-col gap-4'>
          {showAlert && (
            <Alert variant='tonalDestructive'>
              <TbAlertTriangle className='is-6 bs-6' />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {(singInError as unknown) === 'Invalid login credentials'
                  ? 'The email address or password you entered is incorrect. Please try again.'
                  : (singUpError as unknown) === 'User already registered'
                    ? 'User already exists with this email address. Please try again with a different email address or sign in with this email address.'
                    : 'An error occurred. Please try again later.'}
              </AlertDescription>
            </Alert>
          )}
          {isSignUpSuccess ? (
            <Alert variant='tonalSuccess'>
              <TbCircleCheck className='is-6 bs-6' />
              <AlertTitle>Sign Up Successful</AlertTitle>
              <AlertDescription>
                {`You have successfully signed up. Please check and verify your email.`}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <form>
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
                <SubmitButton formAction={form.handleSubmit(onAuthSubmit) as any} pendingText='Submitting...'>
                  Submit
                </SubmitButton>
              </form>
              <div className='flex items-center gap-4'>
                <hr className='flex-1' />
                <span className='text-textPrimary text-base'>or</span>
                <hr className='flex-1' />
              </div>
              <OauthProviders providers={authConfig.providers.oAuth} />
            </>
          )}
        </CardContent>
      </Card>
    </Form>
  )
}

export default AuthForm
