// Next Imports
import Link from 'next/link'

// Third-party Imports
import { cn } from '@repo/ui/lib/utils'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import Trans from '@repo/i18n/Trans'

// Util Imports
import { getAppName } from '@/utils/getAppName'

// Styles Imports
import frontCommonStyles from '../styles.module.css'

const Details = async () => {
  // Vars
  const appName = await getAppName()

  return (
    <div className={cn('bs-full plb-10 sm:plb-20', frontCommonStyles.layoutSpacing)}>
      <Card>
        <CardContent className='pbs-4'>
          <div className='flex flex-col gap-y-4'>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>
                <Trans i18nKey='front-pages:termsIntroTitle' />
              </h3>
              <p>
                <Trans
                  i18nKey='front-pages:termsIntroText'
                  values={{ appName }}
                  components={{ 1: <Link href='/' className='text-primary' /> }}
                />
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>
                <Trans i18nKey='front-pages:termsEligibilityTitle' />
              </h3>
              <p>
                <Trans i18nKey='front-pages:termsEligibilityText' />
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>
                <Trans i18nKey='front-pages:termsAcceptanceTitle' />
              </h3>
              <p>
                <Trans i18nKey='front-pages:termsAcceptanceText' />
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>
                <Trans i18nKey='front-pages:termsAccountsTitle' />
              </h3>
              <p>
                <Trans i18nKey='front-pages:termsAccountsText' />
              </p>
            </div>
            <div>
              <h3 className='mb-2 text-xl font-semibold'>
                <Trans i18nKey='front-pages:termsUseOfServiceTitle' />
              </h3>
              <p className='mb-2'>
                <Trans i18nKey='front-pages:termsUseOfServiceText' />:
              </p>
              <ul className='space-b-1 list-disc pl-6'>
                <li>
                  <Trans i18nKey='front-pages:termsUseOfServiceList1' />
                </li>
                <li>
                  <Trans i18nKey='front-pages:termsUseOfServiceList2' />
                </li>
                <li>
                  <Trans i18nKey='front-pages:termsUseOfServiceList3' />
                </li>
                <li>
                  <Trans i18nKey='front-pages:termsUseOfServiceList4' />
                </li>
              </ul>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>
                <Trans i18nKey='front-pages:termsProductPricingTitle' />
              </h3>
              <p>
                <Trans i18nKey='front-pages:termsProductPricingText' />
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>
                <Trans i18nKey='front-pages:termsRefundsTitle' />
              </h3>
              <p>
                <Trans i18nKey='front-pages:termsRefundsText' />
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>
                <Trans i18nKey='front-pages:termsOwnershipTitle' />
              </h3>
              <p>
                <Trans i18nKey='front-pages:termsOwnershipText' />
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>
                <Trans i18nKey='front-pages:termsCustomizationTitle' />
              </h3>
              <p>
                <Trans i18nKey='front-pages:termsCustomizationText' />
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>
                <Trans i18nKey='front-pages:termsUserContentTitle' />
              </h3>
              <p>
                <Trans i18nKey='front-pages:termsUserContentText' />
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>
                <Trans i18nKey='front-pages:termsIntellectualPropertyTitle' />
              </h3>
              <p>
                <Trans i18nKey='front-pages:termsIntellectualPropertyText' />
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>
                <Trans i18nKey='front-pages:termsThirdPartyLinksTitle' />
              </h3>
              <p>
                <Trans i18nKey='front-pages:termsThirdPartyLinksText' />
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>
                <Trans i18nKey='front-pages:termsTerminationTitle' />
              </h3>
              <p>
                <Trans i18nKey='front-pages:termsTerminationText' />
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>
                <Trans i18nKey='front-pages:termsLimitationOfLiabilityTitle' />
              </h3>
              <p>
                <Trans i18nKey='front-pages:termsLimitationOfLiabilityText' />
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>
                <Trans i18nKey='front-pages:termsDisclaimerOfWarrantiesTitle' />
              </h3>
              <p>
                <Trans i18nKey='front-pages:termsDisclaimerOfWarrantiesText' />
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>
                <Trans i18nKey='front-pages:termsIndemnificationTitle' />
              </h3>
              <p>
                <Trans i18nKey='front-pages:termsIndemnificationText' />
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>
                <Trans i18nKey='front-pages:termsGoverningLawTitle' />
              </h3>
              <p>
                <Trans i18nKey='front-pages:termsGoverningLawText' />
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>
                <Trans i18nKey='front-pages:termsChangesToTermsTitle' />
              </h3>
              <p>
                <Trans i18nKey='front-pages:termsChangesToTermsText' />
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>
                <Trans i18nKey='front-pages:termsContactUsTitle' />
              </h3>
              <p>
                <Trans
                  i18nKey='front-pages:termsContactUsText'
                  components={{ 1: <Link href='https://themeselection.com/contact-us' className='text-primary' /> }}
                />
              </p>
            </div>
            <div>
              <h3 className='mb-2 text-xl font-semibold'>
                <Trans i18nKey='front-pages:termsCookieTitle' />
              </h3>
              <h4 className='mb-2 font-semibold'>
                1. <Trans i18nKey='front-pages:termsCookieUseTitle' />
              </h4>
              <p className='mb-2'>
                <Trans i18nKey='front-pages:termsCookieText' />
              </p>
              <h4 className='mb-2 font-semibold'>
                2. <Trans i18nKey='front-pages:termsCookieTypesTitle' />
              </h4>
              <ul className='space-b-1 list-disc pl-6'>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:termsCookieEssential' />:
                  </span>{' '}
                  <Trans i18nKey='front-pages:termsCookieEssentialDescription' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:termsCookiePerformance' />:
                  </span>{' '}
                  <Trans i18nKey='front-pages:termsCookiePerformanceDescription' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:termsCookieFunctionality' />:
                  </span>{' '}
                  <Trans i18nKey='front-pages:termsCookieFunctionalityDescription' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:termsCookieTargeting' />:
                  </span>{' '}
                  <Trans i18nKey='front-pages:termsCookieTargetingDescription' />
                </li>
              </ul>
            </div>
            <div>
              <h4 className='mb-2 font-semibold'>
                3. <Trans i18nKey='front-pages:termsCookieManagingTitle' />
              </h4>
              <p>
                <Trans i18nKey='front-pages:termsCookieManagingText' />
              </p>
            </div>
            <div>
              <h4 className='mb-2 font-semibold'>
                4. <Trans i18nKey='front-pages:termsCookieChangesTitle' />
              </h4>
              <p>
                <Trans i18nKey='front-pages:termsCookieChangesText' />
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default Details
