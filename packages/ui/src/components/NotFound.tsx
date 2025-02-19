// Next Imports
import Link from 'next/link'

// Third-party Imports
import { TbAlertTriangleFilled } from 'react-icons/tb'
import Trans from '@repo/i18n/Trans'

// Component Imports
import { Button } from '@repo/ui/components/ui/button'

const NotFound = () => {
  return (
    <div className='min-bs-screen'>
      <div className="bg-[url('/images/pages/background-v2.png')] bg-cover bg-center bg-no-repeat">
        <div className='min-bs-screen bg-center bg-no-repeat'>
          <div className='min-bs-screen pli-4 flex flex-col items-center justify-center gap-y-5'>
            <img
              src='/images/pages/not-found-illustration.png'
              alt='not found illustration'
              className='is-[461px] max-is-full bs-full mbs-5'
            />
            <div className='text-center'>
              <h1 className='text-textPrimary flex items-center justify-center gap-x-2 text-2xl font-semibold'>
                <span>
                  <Trans i18nKey='packages-ui:notFoundTitle' />
                </span>
                <TbAlertTriangleFilled className='bs-5 is-5' />
              </h1>
              <p className='mbs-1.5 mbe-5'>
                <Trans i18nKey='packages-ui:notFoundDescription' />
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

export default NotFound
