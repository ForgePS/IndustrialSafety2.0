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
              <h3 className='mbe-2 text-lg font-semibold'>
                <Trans i18nKey='front-pages:privacyIntroTitle' />
              </h3>
              <p>
                <Trans
                  i18nKey='front-pages:privacyIntroText'
                  values={{ appName }}
                  components={{ 1: <Link href='/' className='text-primary' /> }}
                />
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-lg font-semibold'>
                <Trans i18nKey='front-pages:privacyCollectTitle' />
              </h3>
              <p className='mb-2'>
                <Trans i18nKey='front-pages:privacyCollectText' />
              </p>
              <h4 className='mb-2 font-semibold'>
                a. <Trans i18nKey='front-pages:privacyPersonalDataTitle' />:
              </h4>
              <p className='mb-2'>
                <Trans i18nKey='front-pages:privacyPersonalDataText' />:
              </p>
              <ul className='list-disc space-y-1 pl-6'>
                <li>
                  <Trans i18nKey='front-pages:privacyPersonalDataList1' />
                </li>
                <li>
                  <Trans i18nKey='front-pages:emailAddressLabel' />
                </li>
                <li>
                  <Trans i18nKey='front-pages:privacyPersonalDataList3' />
                </li>
                <li>
                  <Trans i18nKey='front-pages:privacyPersonalDataList4' />
                </li>
              </ul>
            </div>
            <div>
              <h3 className='mbe-2 font-semibold'>
                b. <Trans i18nKey='front-pages:privacyUsageDataTitle' />:
              </h3>
              <p className='mb-2'>
                <Trans i18nKey='front-pages:privacyUsageDataText' />:
              </p>
              <ul className='list-disc space-y-1 pl-6'>
                <li>
                  <Trans i18nKey='front-pages:privacyUsageDataList1' />
                </li>
                <li>
                  <Trans i18nKey='front-pages:privacyUsageDataList2' />
                </li>
                <li>
                  <Trans i18nKey='front-pages:privacyUsageDataList3' />
                </li>
                <li>
                  <Trans i18nKey='front-pages:privacyUsageDataList4' />
                </li>
                <li>
                  <Trans i18nKey='front-pages:privacyUsageDataList5' />
                </li>
                <li>
                  <Trans i18nKey='front-pages:privacyUsageDataList6' />
                </li>
                <li>
                  <Trans i18nKey='front-pages:privacyUsageDataList7' />
                </li>
              </ul>
            </div>
            <div>
              <h3 className='mbe-2 font-semibold'>
                c. <Trans i18nKey='front-pages:privacyCookiesTitle' />:
              </h3>
              <p className='mb-2'>
                <Trans i18nKey='front-pages:privacyCookiesText' />
              </p>
              <h4 className='font-semibold'>
                <Trans i18nKey='front-pages:privacyCookieTypesTitle' />:
              </h4>
              <ul className='list-disc space-y-1 pl-6'>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyCookieEssential' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyCookieEssentialText' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyCookieAnalytics' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyCookieAnalyticsText' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyCookieFunctional' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyCookieFunctionalText' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyCookieAdvertising' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyCookieAdvertisingText' />
                </li>
              </ul>
            </div>
            <div>
              <h3 className='mbe-2 text-lg font-semibold'>
                <Trans i18nKey='front-pages:privacyUseTitle' />
              </h3>
              <p className='mbe-2'>
                <Trans i18nKey='front-pages:privacyUseText' />:
              </p>
              <ul className='list-disc space-y-1 pl-6'>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyUseList1Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyUseList1Text' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyUseList2Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyUseList2Text' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyUseList3Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyUseList3Text' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyUseList4Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyUseList4Text' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyUseList5Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyUseList5Text' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyUseList6Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyUseList6Text' />
                </li>
              </ul>
            </div>
            <div>
              <h3 className='mbe-2 text-lg font-semibold'>
                <Trans i18nKey='front-pages:privacyLegalBasisTitle' />
              </h3>
              <p className='mbe-2'>
                <Trans i18nKey='front-pages:privacyLegalBasisText' />:
              </p>
              <ul className='list-disc space-y-1 pl-6'>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyLegalBasisList1Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyLegalBasisList1Text' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyLegalBasisList2Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyLegalBasisList2Text' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyLegalBasisList3Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyLegalBasisList3Text' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyLegalBasisList4Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyLegalBasisList4Text' />
                </li>
              </ul>
            </div>
            <div>
              <h3 className='mbe-2 text-lg font-semibold'>
                <Trans i18nKey='front-pages:privacyRetentionTitle' />
              </h3>
              <p className='mbe-2'>
                <Trans i18nKey='front-pages:privacyRetentionText' />:
              </p>
              <ul className='list-disc space-y-1 pl-6'>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyRetentionList1Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyRetentionList1Text' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyRetentionList2Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyRetentionList2Text' />
                </li>
              </ul>
            </div>
            <div>
              <h3 className='mbe-2 text-lg font-semibold'>
                <Trans i18nKey='front-pages:privacySharingTitle' />
              </h3>
              <p className='mbe-2'>
                <Trans i18nKey='front-pages:privacySharingText' />:
              </p>
              <ul className='list-disc space-y-1 pl-6'>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacySharingList1Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacySharingList1Text' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacySharingList2Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacySharingList2Text' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacySharingList3Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacySharingList3Text' />
                </li>
              </ul>
            </div>
            <div>
              <h3 className='mbe-2 text-lg font-semibold'>
                <Trans i18nKey='front-pages:privacyTransferTitle' />
              </h3>
              <p className='mbe-2'>
                <Trans i18nKey='front-pages:privacyTransferText' />:
              </p>
              <ul className='list-disc space-y-1 pl-6'>
                <li>
                  <Trans i18nKey='front-pages:privacyTransferList1' />
                </li>
              </ul>
            </div>
            <div>
              <h3 className='mbe-2 text-lg font-semibold'>
                <Trans i18nKey='front-pages:privacySecurityTitle' />
              </h3>
              <p className='mbe-2'>
                <Trans i18nKey='front-pages:privacySecurityText' />:
              </p>
              <ul className='list-disc space-y-1 pl-6'>
                <li>
                  <Trans i18nKey='front-pages:privacySecurityList1' />
                </li>
                <li>
                  <Trans i18nKey='front-pages:privacySecurityList2' />
                </li>
              </ul>
              <p>
                <Trans i18nKey='front-pages:privacySecurityNote' />
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-lg font-semibold'>
                <Trans i18nKey='front-pages:privacyRightsTitle' />
              </h3>
              <p className='mbe-2'>
                <Trans i18nKey='front-pages:privacyRightsText' />:
              </p>
              <ul className='mbe-2 list-disc space-y-1 pl-6'>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyRightsList1Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyRightsList1Text' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyRightsList2Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyRightsList2Text' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyRightsList3Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyRightsList3Text' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyRightsList4Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyRightsList4Text' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyRightsList5Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyRightsList5Text' />
                </li>
                <li>
                  <span className='font-semibold'>
                    <Trans i18nKey='front-pages:privacyRightsList6Title' />
                  </span>
                  : <Trans i18nKey='front-pages:privacyRightsList6Text' />
                </li>
              </ul>
              <p className='mbe-2'>
                <Trans
                  i18nKey='front-pages:privacyRightsContact'
                  components={{ 1: <Link href='https://themeselection.com/contact-us' className='text-primary' /> }}
                />
              </p>
            </div>
            <div>
              <h4 className='mb-2 text-lg font-semibold'>
                <Trans i18nKey='front-pages:privacyCookiePolicyTitle' />
              </h4>
              <p>
                <Trans i18nKey='front-pages:privacyCookiePolicyText' />
                <br />
                <Trans i18nKey='front-pages:privacyCookiePolicyManagement' />
                <br />
                <Trans
                  i18nKey='front-pages:privacyCookiePolicyMore'
                  components={{ 1: <Link href='/terms-of-service' className='text-primary' /> }}
                />
              </p>
            </div>
            <div>
              <h4 className='mb-2 text-lg font-semibold'>
                <Trans i18nKey='front-pages:privacyLinksTitle' />
              </h4>
              <p>
                <Trans i18nKey='front-pages:privacyLinksText' />
              </p>
            </div>
            <div>
              <h4 className='mb-2 text-lg font-semibold'>
                <Trans i18nKey='front-pages:privacyChildrenTitle' />
              </h4>
              <p>
                <Trans i18nKey='front-pages:privacyChildrenText' />
              </p>
            </div>
            <div>
              <h4 className='mb-2 text-lg font-semibold'>
                <Trans i18nKey='front-pages:privacyBreachTitle' />
              </h4>
              <p>
                <Trans i18nKey='front-pages:privacyBreachText' />
              </p>
            </div>
            <div>
              <h4 className='mb-2 text-lg font-semibold'>
                <Trans i18nKey='front-pages:privacyChangesTitle' />
              </h4>
              <p>
                <Trans i18nKey='front-pages:privacyChangesText' />
              </p>
            </div>
            <div>
              <h4 className='mb-2 text-lg font-semibold'>
                <Trans i18nKey='front-pages:privacyContactTitle' />
              </h4>
              <p>
                <Trans
                  i18nKey='front-pages:privacyContactText'
                  components={{ 1: <Link href='https://themeselection.com/contact-us' className='text-primary' /> }}
                />
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default Details
