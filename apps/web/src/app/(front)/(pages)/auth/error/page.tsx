// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbAlertTriangle } from 'react-icons/tb'
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/ui/alert'
import Trans from '@repo/i18n/Trans'
import { cn } from '@repo/ui/lib/utils'

// Styles Imports
import frontCommonStyles from '../../styles.module.css'

export const metadata: Metadata = {
  title: { absolute: 'Error' },
  alternates: {
    canonical: 'https://jetship-nextjs-saas-boilerplate-demo.vercel.app/auth/error'
  }
}

const ErrorPage = async (props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  // Vars
  const { message } = await props.searchParams

  const errorMessageKey = message?.includes('both auth code and code verifier should be non-empty')
    ? 'auth:alertErrorDescriptionCodeVerifierEmpty'
    : 'auth:alertErrorDescriptionDefault'

  return (
    <div className={cn('bs-full plb-10 sm:plb-20 flex items-center justify-center', frontCommonStyles.layoutSpacing)}>
      <Alert variant='tonalDestructive' className='!is-auto'>
        <TbAlertTriangle className='is-6 bs-6' />
        <AlertTitle>
          <Trans i18nKey='auth:alertErrorTitle' />
        </AlertTitle>
        <AlertDescription>
          <Trans i18nKey={errorMessageKey} />
        </AlertDescription>
      </Alert>
    </div>
  )
}

export default ErrorPage
