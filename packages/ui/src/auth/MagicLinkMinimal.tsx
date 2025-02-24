// Third-party Imports
import { TbMail } from 'react-icons/tb'
import Trans from '@repo/i18n/Trans'

// Component Imports
import Logo from '@components/layout/front/Logo'
import { Button } from '@repo/ui/components/ui/button'
import { Label } from '@repo/ui/components/ui/label'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import TranslatedInput from '@repo/ui/components/ui/translated-input'
import Link from '@repo/ui/components/Link'

// SVG Imports
import Google from '@repo/ui/assets/svg/Google'

const MagicLinkMinimal = async () => {
  return (
    <div className="bg-[url('/images/pages/background-v1.png')] bg-cover bg-center bg-no-repeat">
      <div className="min-bs-screen flex flex-col items-center justify-center bg-[url('/svg/auth-bg-shape.svg')] bg-center bg-no-repeat max-md:bg-none">
        <Card className='md:is-[430px] m-6 rounded-xl shadow-md'>
          <CardContent className='flex flex-col gap-6 !p-8'>
            <Logo />
            <div className='flex flex-col gap-y-1.5'>
              <h1 className='text-textPrimary text-2xl font-semibold'>
                <Trans i18nKey='packages-ui:magicLinkTitle' />
              </h1>
              <p className='text-textSecondary'>
                <Trans i18nKey='packages-ui:magicLinkDescription' />
              </p>
            </div>
            <div className='flex flex-col gap-4'>
              <div>
                <Label htmlFor='email'>
                  <Trans i18nKey='packages-ui:emailLabel' />
                  <sup className='text-destructive'>*</sup>
                </Label>
                <TranslatedInput id='email' type='email' translationKey='packages-ui:emailPlaceholder' />
              </div>
              <Button>
                <TbMail className='is-5 bs-5' />
                <span>
                  <Trans i18nKey='packages-ui:sendMagicLinkButton' />
                </span>
              </Button>
              <p className='flex flex-wrap items-center justify-center gap-1 text-base'>
                <span className='text-textSecondary'>
                  <Trans i18nKey='packages-ui:accessAccountWithText' />
                </span>
                <Link className='text-primary'>
                  <Trans i18nKey='packages-ui:passwordLabel' />
                </Link>
              </p>
              <div className='flex items-center gap-4'>
                <hr className='flex-1' />
                <span className='text-textPrimary text-base'>
                  <Trans i18nKey='packages-ui:orText' />
                </span>
                <hr className='flex-1' />
              </div>
              <Button variant='ghost'>
                <Google className='text-xl' />
                <span className='text-textPrimary'>
                  <Trans i18nKey='packages-ui:signInWithGoogleButton' />
                </span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default MagicLinkMinimal
