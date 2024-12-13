// Next Imports
import Link from 'next/link'

// Third-party Imports
import { TbMail } from 'react-icons/tb'

// Component Imports
import Logo from '@components/layout/front/Logo'

import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import Google from '@repo/ui/assets/svg/Google'

// Util Imports
import { getAppName } from '@/utils/getAppName'

const MagicLinkMinimal = async () => {
  // Vars
  const appName = await getAppName()

  return (
    <div className="bg-[url('/images/pages/background-v1.png')] bg-cover bg-center bg-no-repeat">
      <div className="min-bs-screen flex flex-col items-center justify-center bg-[url('/svg/auth-bg-shape.svg')] bg-center bg-no-repeat max-md:bg-none">
        <Card className='md:is-[430px] m-6 rounded-xl shadow-md'>
          <CardContent className='flex flex-col gap-6 !p-8'>
            <Logo appName={appName} />
            <div className='flex flex-col gap-y-1.5'>
              <h1 className='text-textPrimary text-2xl font-semibold'>Magic Link</h1>
              <p className='text-textSecondary'>Please enter your email for the magic link</p>
            </div>
            <div className='flex flex-col gap-4'>
              <div>
                <Label htmlFor='email'>
                  Email address<sup className='text-destructive'>*</sup>
                </Label>
                <Input id='email' type='email' placeholder='Enter your email address' />
              </div>
              <Button>
                <TbMail className='is-5 bs-5' />
                <span>Send a magic link</span>
              </Button>
              <p className='flex flex-wrap items-center justify-center gap-1 text-base'>
                <span className='text-textSecondary'>Access your account with</span>
                <Link href='/auth/login-v2' className='text-primary'>
                  Password
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

export default MagicLinkMinimal
