// Next Imports
import Link from 'next/link'

// Third-party Imports
import { Button } from '@repo/ui/components/ui/button'

const Password = () => {
  return (
    <div className='pbs-6 grid gap-6 md:grid-cols-2'>
      <div className='flex flex-col items-start gap-1'>
        <h3 className='text-textPrimary text-lg font-medium'>Change Password</h3>
        <p className='text-textSecondary text-sm'>Click this button to change your password.</p>
      </div>
      <div>
        <Button asChild>
          <Link href='/reset-password'>Change Password</Link>
        </Button>
      </div>
    </div>
  )
}

export default Password
