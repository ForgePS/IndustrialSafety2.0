// Next Imports
import Link from 'next/link'

// Component Imports
import Logo from '@components/layout/front/Logo'

import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import PasswordInput from '@repo/ui/components/ui/password-input'
import { Checkbox } from '@repo/ui/components/ui/checkbox'
import { Label } from '@repo/ui/components/ui/label'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import Google from '@repo/ui/assets/svg/Google'

// Util Imports
import { getAppName } from '@/utils/getAppName'

const LoginMinimal = async () => {
  // Vars
  const appName = await getAppName()

  return (
    <div className="bg-[url('/images/pages/background-v1.png')] bg-cover bg-center bg-no-repeat">
      <div className="min-bs-screen flex flex-col items-center justify-center bg-[url('/svg/auth-bg-shape.svg')] bg-center bg-no-repeat max-md:bg-none">
        <Card className='md:is-[430px] m-6 rounded-xl shadow-md'>
          <CardContent className='flex flex-col gap-6 !p-8'>
            <Logo appName={appName} />
            <div className='flex flex-col gap-y-1.5'>
              <h1 className='text-textPrimary text-2xl font-semibold'>{`Sign in to ${appName}`}</h1>
              <p className='text-textSecondary'>Ship Faster and Focus on Growth</p>
            </div>
            <p className='text-textSecondary flex gap-x-1'>
              <span>Login with</span>
              <Link href='' className='text-primary'>
                Magic Link
              </Link>
            </p>
            <div className='flex gap-6 max-sm:flex-wrap'>
              <Button variant='outline' className='is-full'>
                Login as User
              </Button>
              <Button variant='outline' className='is-full'>
                Login as Admin
              </Button>
            </div>
            <div className='flex flex-col gap-4'>
              <div>
                <Label htmlFor='email'>
                  Email address<sup className='text-destructive'>*</sup>
                </Label>
                <Input id='email' type='email' placeholder='Enter your email address' />
              </div>
              <div>
                <Label htmlFor='password'>
                  Password<sup className='text-destructive'>*</sup>
                </Label>
                <PasswordInput id='password' placeholder='················' />
              </div>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='flex items-center'>
                  <Checkbox id='remember' />
                  <Label htmlFor='remember' className='mis-3 text-textSecondary text-base'>
                    Remember Me
                  </Label>
                </div>
                <Link href='' className='text-primary'>
                  Forgot Password?
                </Link>
              </div>
              <Button>{`Sign in to ${appName}`}</Button>
              <p className='flex flex-wrap items-center justify-center gap-1 text-base'>
                <span className='text-textSecondary'>New on our platform?</span>
                <Link href='' className='text-primary'>
                  Create an account
                </Link>
              </p>
              <div className='flex items-center gap-4'>
                <hr className='flex-1' />
                <span className='text-textPrimary text-base'>or</span>
                <hr className='flex-1' />
              </div>
              <Button variant='ghost'>
                <Google className='text-xl' />
                <span className='text-textPrimary'>Sign in with Google</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default LoginMinimal
