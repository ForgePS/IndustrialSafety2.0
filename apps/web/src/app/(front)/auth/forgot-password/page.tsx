// Next Imports
import Link from 'next/link'

// Third-party Imports
import { TbChevronLeft } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import LeftSection from '@repo/ui/auth/LeftSection'
import { createServiceRoleClient } from '@repo/supabase/server'

// Component Imports
import Logo from '@components/layout/front/Logo'
import ForgotPasswordForm from './ForgotPasswordForm'

// Util Imports
import { getAppName } from '@/utils/getAppName'

const ForgotPassword = async () => {
  // Vars
  const appName = await getAppName()

  const supabase = createServiceRoleClient()

  const {
    data: { users }
  } = await supabase.auth.admin.listUsers()

  return (
    <div className='min-bs-screen flex'>
      <LeftSection />
      <div className='bg-card min-bs-screen relative basis-full lg:basis-2/5 xl:basis-1/3'>
        <div className='pbs-8 is-full absolute'>
          <Link href='/' className='is-10/12 md:is-1/2 lg:is-4/5 mli-auto flex items-center gap-2'>
            <TbChevronLeft className='is-[22px] bs-[22px] text-textSecondary' />
            <span className='text-textSecondary'>Back to the website</span>
          </Link>
        </div>
        <div className='plb-[15rem] bs-full flex grow flex-col items-center justify-center'>
          <div className='is-10/12 md:is-1/2 lg:is-4/5 mli-auto flex flex-col gap-6'>
            <Logo appName={appName} />
            <div className='flex flex-col gap-y-1.5'>
              <h1 className='text-textPrimary text-2xl font-semibold'>Forgot Password?</h1>
              <p className='text-textSecondary'>
                Enter your email and we&apos;ll send you instructions to reset your password
              </p>
            </div>
            <div className='flex flex-col gap-4'>
              <ForgotPasswordForm users={users} />
              <Button variant='ghostPrimary' asChild>
                <Link href='/auth/login' className='flex items-center gap-x-2'>
                  <TbChevronLeft className='is-[22px] bs-[22px]' />
                  <span>Back to Login</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword
