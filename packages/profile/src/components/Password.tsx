// Next Imports
import Link from 'next/link'

// Third-party Imports
import { Button } from '@repo/ui/components/ui/button'
import Trans from '@repo/i18n/Trans'

const Password = () => {
  return (
    <div className='pbs-6 grid gap-6 md:grid-cols-2'>
      <div className='flex flex-col items-start gap-1'>
        <h3 className='text-textPrimary text-lg font-medium'>
          <Trans i18nKey='packages-profile:changePasswordText' />
        </h3>
        <p className='text-textSecondary text-sm'>
          <Trans i18nKey='packages-profile:changePasswordDescription' />
        </p>
      </div>
      <div>
        <Button asChild>
          <Link href='/reset-password'>
            <Trans i18nKey='packages-profile:changePasswordText' />
          </Link>
        </Button>
      </div>
    </div>
  )
}

export default Password
