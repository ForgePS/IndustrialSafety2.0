// Next Imports
import Link from 'next/link'
import type { Metadata } from 'next'

// Third-party Imports
import { TbAlertTriangle } from 'react-icons/tb'
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/ui/alert'
import { Button } from '@repo/ui/components/ui/button'
import Trans from '@repo/i18n/Trans'

// Component Imports
import Logo from '@components/layout/front/Logo'

export const metadata: Metadata = {
  title: { absolute: 'Sign-in problem' }
}

const ErrorPage = async (props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  // Vars
  const { message } = await props.searchParams

  const errorMessageKey = message?.includes('both auth code and code verifier should be non-empty')
    ? 'auth:alertErrorDescriptionCodeVerifierEmpty'
    : 'auth:alertErrorDescriptionDefault'

  return (
    <main className='min-bs-screen bg-background flex items-center justify-center p-6'>
      <div className='is-full max-is-md flex flex-col gap-6'>
        <Logo />
        <Alert variant='tonalDestructive'>
          <TbAlertTriangle className='is-6 bs-6' />
          <AlertTitle>
            <Trans i18nKey='auth:alertErrorTitle' />
          </AlertTitle>
          <AlertDescription>
            <Trans i18nKey={errorMessageKey} />
          </AlertDescription>
        </Alert>
        <Button asChild className='self-start'>
          <Link href='/auth/login'>Back to sign in</Link>
        </Button>
      </div>
    </main>
  )
}

export default ErrorPage
