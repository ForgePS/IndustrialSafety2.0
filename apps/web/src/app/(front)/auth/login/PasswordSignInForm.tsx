'use client'

// React Imports
import { useEffect, useState } from 'react'
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
import { Checkbox } from '@repo/ui/components/ui/checkbox'
import { Label } from '@repo/ui/components/ui/label'
import SubmitButton from '@repo/ui/components/SubmitButton'
import { passwordSignInFormSchema, usePasswordSignIn } from '@repo/auth/sign-in'
import type { User } from '@supabase/supabase-js'
import type { PasswordSignInFormData } from '@repo/auth/sign-in'

const PasswordSignInForm = ({ appName, users }: { appName: string; users: User[] | null }) => {
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

  const { handleSignIn, error } = usePasswordSignIn(`/auth/verify-email?email=${form.getValues('email')}`)

  const handleButtonClick = (value: string) => {
    form.setValue('email', value === 'admin' ? 'admin@jetship.com' : 'user@jetship.com')
    form.setValue('password', value === 'admin' ? 'adminpassword' : 'userpassword')
  }

  const onSubmit = async (formData: PasswordSignInFormData) => {
    try {
      setShowAlert(false)
      await handleSignIn(formData, users)
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
          <AlertTitle>Login Failed</AlertTitle>
          <AlertDescription>
            {((error as unknown) === 'Invalid login credentials'
              ? 'The email address or password you entered is incorrect. Please try again.'
              : (error as unknown as ReactNode)) ?? 'An error occurred while logging in. Please try again later.'}
          </AlertDescription>
        </Alert>
      )}
      <Form {...form}>
        <form className='flex flex-col gap-4'>
          <div className='mbe-2 flex flex-wrap gap-6 sm:flex-nowrap lg:flex-wrap xl:flex-nowrap'>
            <Button type='button' variant='outline' className='is-full' onClick={() => handleButtonClick('user')}>
              Login as User
            </Button>
            <Button type='button' variant='outline' className='is-full' onClick={() => handleButtonClick('admin')}>
              Login as Admin
            </Button>
          </div>
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
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div className='flex items-center'>
              <Checkbox id='remember' />
              <Label htmlFor='remember' className='mis-3 text-textSecondary text-base'>
                Remember Me
              </Label>
            </div>
            <Link href='/auth/forgot-password' className='text-primary'>
              Forgot Password?
            </Link>
          </div>
          <SubmitButton formAction={form.handleSubmit(onSubmit) as any} pendingText={`Signing in to ${appName}...`}>
            {`Sign in to ${appName}`}
          </SubmitButton>
        </form>
      </Form>
    </>
  )
}

export default PasswordSignInForm
