// Third-party Imports
import { TbCirclePlus, TbCircleCheck, TbStar, TbRefresh } from 'react-icons/tb'
import {
  Timeline,
  TimelineConnector,
  TimelineContent,
  TimelineDescription,
  TimelineIcon,
  TimelineItem,
  TimelineSeparator,
  TimelineTime
} from '@repo/ui/components/ui/timeline'
import { Badge } from '@repo/ui/components/ui/badge'
import Trans from '@repo/i18n/Trans'

// Component Imports
import Logo from '@components/layout/front/Logo'

// Util Imports
import { getAppName } from '@/utils/getAppName'

const Details = async () => {
  // Vars
  const appName = await getAppName()

  return (
    <div className='plb-20 pli-6 max-is-[848px] mli-auto'>
      <Timeline>
        <TimelineItem>
          <TimelineTime className='max-md:hidden'>
            <Badge className='bg-neutral text-card mbs-[5px]' size='md'>
              v1.1.0
            </Badge>
            <span className='font-medium'>May 20, 2024</span>
          </TimelineTime>
          <TimelineSeparator>
            <TimelineIcon />
            <TimelineConnector />
          </TimelineSeparator>
          <TimelineContent>
            <TimelineDescription>
              <div className='bg-primary/10 border-primary/10 flex flex-col items-center gap-6 rounded-xl border p-6'>
                <Badge size='xl'>v1.1.0</Badge>
                <Logo appName={appName} />
                <p className='text-textDisabled text-sm md:hidden'>May 20, 2024</p>
              </div>
              <div className='flex flex-col items-start gap-3'>
                <Badge
                  shape='circle'
                  variant='accent'
                  className='text-textPrimary !plb-1.5 gap-2 text-base font-semibold'
                >
                  <TbCirclePlus className='size-[22px]' />
                  <span>
                    <Trans i18nKey='front-pages:changelogAddedLabel' />
                  </span>
                </Badge>
                <ul className='text-textSecondary mis-6 flex list-disc flex-col text-base'>
                  <li>
                    <span className='font-semibold'>
                      <Trans i18nKey='front-pages:changelogAccordionText' />:
                    </span>{' '}
                    <Trans i18nKey='front-pages:changelogTreeViewComponent' />
                  </li>
                  <li>
                    <span className='font-semibold'>
                      <Trans i18nKey='front-pages:changelogTextareaText' />:
                    </span>{' '}
                    <Trans i18nKey='front-pages:changelogDefaultHeight' />
                  </li>
                  <li>
                    <span className='font-semibold'>
                      <Trans i18nKey='front-pages:changelogCopyMarkupText' />:
                    </span>{' '}
                    <Trans i18nKey='front-pages:changelogPredefinedMarkup' />
                  </li>
                </ul>
              </div>
              <div className='flex flex-col items-start gap-3'>
                <Badge
                  shape='circle'
                  variant='accent'
                  className='text-textPrimary !plb-1.5 gap-2 text-base font-semibold'
                >
                  <TbCircleCheck className='size-[22px]' />
                  <span>
                    <Trans i18nKey='front-pages:changelogFixesAndImprovementsLabel' />
                  </span>
                </Badge>
                <ul className='text-textSecondary mis-6 flex list-disc flex-col text-base'>
                  <li>
                    <span className='font-semibold'>
                      <Trans i18nKey='front-pages:changelogImprovedText' />:
                    </span>{' '}
                    <Trans i18nKey='front-pages:changelogCorePluginImprovement' />
                  </li>
                  <li>
                    <span className='font-semibold'>
                      <Trans i18nKey='front-pages:changelogFeatureRequestText' />:
                    </span>{' '}
                    <Trans i18nKey='front-pages:changelogTreeViewRequest' />
                  </li>
                  <li>
                    <span className='font-semibold'>
                      <Trans i18nKey='front-pages:changelogFixedText' />:
                    </span>{' '}
                    <Trans i18nKey='front-pages:changelogWysiwygFix' />
                  </li>
                  <li>
                    <span className='font-semibold'>
                      <Trans i18nKey='front-pages:changelogFixedText' />:
                    </span>{' '}
                    <Trans i18nKey='front-pages:changelogComboboxFix' />
                  </li>
                </ul>
              </div>
              <div className='flex flex-col items-start gap-3'>
                <Badge
                  shape='circle'
                  variant='accent'
                  className='text-textPrimary !plb-1.5 gap-2 text-base font-semibold'
                >
                  <TbRefresh className='size-[22px]' />
                  <span>
                    <Trans i18nKey='front-pages:changelogUpdatesLabel' />
                  </span>
                </Badge>
                <ul className='text-textSecondary mis-6 flex list-disc flex-col text-base'>
                  <li>
                    <span className='font-semibold'>
                      <Trans i18nKey='front-pages:changelogUpdatedText' />:
                    </span>{' '}
                    <Trans i18nKey='front-pages:changelogTailwindUpdate' />
                  </li>
                </ul>
              </div>
            </TimelineDescription>
          </TimelineContent>
        </TimelineItem>
        <TimelineItem>
          <TimelineTime className='max-md:hidden'>
            <Badge className='bg-neutral text-card mbs-[5px]' size='md'>
              v1.0.0
            </Badge>
            <span className='font-medium'>March 25, 2024</span>
          </TimelineTime>
          <TimelineSeparator>
            <TimelineIcon />
            <TimelineConnector />
          </TimelineSeparator>
          <TimelineContent>
            <TimelineDescription>
              <div className='bg-primary/10 border-primary/10 flex flex-col items-center gap-6 rounded-xl border p-6'>
                <Badge size='xl'>v1.0.0</Badge>
                <Logo appName={appName} />
                <p className='text-textDisabled text-sm md:hidden'>March 25, 2024</p>
              </div>
              <div className='flex flex-col items-start gap-3'>
                <Badge
                  shape='circle'
                  variant='accent'
                  className='text-textPrimary !plb-1.5 gap-2 text-base font-semibold'
                >
                  <TbStar className='size-[22px]' />
                  <span>
                    <Trans i18nKey='front-pages:changelogNewPluginsLabel' />
                  </span>
                </Badge>
                <ul className='text-textSecondary mis-6 flex list-disc flex-col text-base'>
                  <li>
                    <span className='font-semibold'>
                      <Trans i18nKey='front-pages:changelogPluginsText' />:
                    </span>{' '}
                    <Trans i18nKey='front-pages:changelogComboboxPlugin' />
                  </li>
                  <li>
                    <span className='font-semibold'>
                      <Trans i18nKey='front-pages:changelogPluginsText' />:
                    </span>{' '}
                    <Trans i18nKey='front-pages:changelogThemeSwitchPlugin' />
                  </li>
                  <li>
                    <span className='font-semibold'>
                      <Trans i18nKey='front-pages:changelogNewFeatureText' />:
                    </span>{' '}
                    <Trans i18nKey='front-pages:changelogAdvancedSelectFeature' />
                  </li>
                </ul>
              </div>
              <div className='flex flex-col items-start gap-3'>
                <Badge
                  shape='circle'
                  variant='accent'
                  className='text-textPrimary !plb-1.5 gap-2 text-base font-semibold'
                >
                  <TbCirclePlus className='size-[22px]' />
                  <span>
                    <Trans i18nKey='front-pages:changelogAddedLabel' />
                  </span>
                </Badge>
                <ul className='text-textSecondary mis-6 flex list-disc flex-col text-base'>
                  <li>
                    <span className='font-semibold'>
                      <Trans i18nKey='front-pages:changelogDocumentationText' />:
                    </span>{' '}
                    <Trans i18nKey='front-pages:changelogPrelineJS' />
                  </li>
                  <li>
                    <span className='font-semibold'>
                      <Trans i18nKey='front-pages:changelogComponentPluginText' />:
                    </span>{' '}
                    <Trans i18nKey='front-pages:changelogComboboxPlugin' />
                  </li>
                  <li>
                    <span className='font-semibold'>
                      <Trans i18nKey='front-pages:changelogComponentPluginText' />:
                    </span>{' '}
                    <Trans i18nKey='front-pages:changelogSearchboxPlugin' />
                  </li>
                  <li>
                    <span className='font-semibold'>
                      <Trans i18nKey='front-pages:changelogComponentPluginText' />:
                    </span>{' '}
                    <Trans i18nKey='front-pages:changelogPinInputFeature' />
                  </li>
                  <li>
                    <span className='font-semibold'>
                      <Trans i18nKey='front-pages:changelogTextareaText' />:
                    </span>{' '}
                    <Trans i18nKey='front-pages:changelogTextareaModal' />
                  </li>
                  <li>
                    <span className='font-semibold'>
                      <Trans i18nKey='front-pages:changelogInputNumberText' />:
                    </span>{' '}
                    <Trans i18nKey='front-pages:changelogStepControls' />
                  </li>
                  <li>
                    <span className='font-semibold'>
                      <Trans i18nKey='front-pages:changelogInputNumberText' />:
                    </span>{' '}
                    <Trans i18nKey='front-pages:changelogNegativeValue' />
                  </li>
                </ul>
              </div>
            </TimelineDescription>
          </TimelineContent>
        </TimelineItem>
      </Timeline>
    </div>
  )
}

export default Details
