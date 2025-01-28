// Next Imports
import Link from 'next/link'

// Third-party Imports
import Trans from '@repo/i18n/Trans'

// Component Imports
import { Button } from '@repo/ui/components/ui/button'

const NotAuthorized = () => {
  return (
    <div className='min-bs-screen'>
      <div className="bg-[url('/images/pages/background-v2.png')] bg-cover bg-center bg-no-repeat">
        <div className='min-bs-screen bg-center bg-no-repeat'>
          <div className='min-bs-screen pli-4 flex flex-col items-center justify-center gap-y-5'>
            <img src='/images/pages/not-authorized-illustration.png' className='is-[620px] max-is-full bs-full mbs-5' />
            <div className='mbs-16 text-center'>
              <h3 className='text-textPrimary text-2xl font-semibold'>
                <Trans i18nKey='packages-ui:notAuthorizedTitle' />
              </h3>
              <p className='mbs-1.5 mbe-5'>
                <Trans i18nKey='packages-ui:notAuthorizedDescription' />
              </p>
              <Button asChild>
                <Link href='/'>
                  <Trans i18nKey='packages-ui:backToHomeButton' />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default NotAuthorized
