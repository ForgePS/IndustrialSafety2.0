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
            <span>May 20, 2024</span>
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
                <Badge shape='circle' variant='accent' className='text-textPrimary !plb-1.5 text-base font-semibold'>
                  <TbCirclePlus className='size-[22px]' />
                  <span>Added</span>
                </Badge>
                <ul className='text-textSecondary mis-6 flex list-disc flex-col text-base'>
                  <li>
                    <span className='font-semibold'>Accordion:</span> Tree View Component
                  </li>
                  <li>
                    <span className='font-semibold'>Textarea:</span> Default height with autoheight script
                  </li>
                  <li>
                    <span className='font-semibold'>Copy Markup:</span> Predefined markup
                  </li>
                </ul>
              </div>
              <div className='flex flex-col items-start gap-3'>
                <Badge shape='circle' variant='accent' className='text-textPrimary !plb-1.5 text-base font-semibold'>
                  <TbCircleCheck className='size-[22px]' />
                  <span>Fixes and Improvements</span>
                </Badge>
                <ul className='text-textSecondary mis-6 flex list-disc flex-col text-base'>
                  <li>
                    <span className='font-semibold'>Improved:</span> core plugin scripts for Dropdown, ComboBox,
                    Accordion and others.
                  </li>
                  <li>
                    <span className='font-semibold'>Feature request:</span> Tree View component
                  </li>
                  <li>
                    <span className='font-semibold'>Fixed:</span> WYSIWYG editor
                  </li>
                  <li>
                    <span className='font-semibold'>Fixed:</span> Combobox selection of ahref items using keyboard
                  </li>
                </ul>
              </div>
              <div className='flex flex-col items-start gap-3'>
                <Badge shape='circle' variant='accent' className='text-textPrimary !plb-1.5 text-base font-semibold'>
                  <TbRefresh className='size-[22px]' />
                  <span>Updates</span>
                </Badge>
                <ul className='text-textSecondary mis-6 flex list-disc flex-col text-base'>
                  <li>
                    <span className='font-semibold'>Updated:</span> Tailwind CSS to v3.4.1
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
            <span>March 25, 2024</span>
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
                <Badge shape='circle' variant='accent' className='text-textPrimary !plb-1.5 text-base font-semibold'>
                  <TbStar className='size-[22px]' />
                  <span>New Plugins</span>
                </Badge>
                <ul className='text-textSecondary mis-6 flex list-disc flex-col text-base'>
                  <li>
                    <span className='font-semibold'>Plugins:</span> ComboBox (Autocomplete)
                  </li>
                  <li>
                    <span className='font-semibold'>Plugins:</span> Theme-Switch (Darkmode)
                  </li>
                  <li>
                    <span className='font-semibold'>New Feature:</span> Added preventSearchFocus to Advanced Select that
                    sets autofocus for the search field inside a dropdown list if the value is true.
                  </li>
                </ul>
              </div>
              <div className='flex flex-col items-start gap-3'>
                <Badge shape='circle' variant='accent' className='text-textPrimary !plb-1.5 text-base font-semibold'>
                  <TbCirclePlus className='size-[22px]' />
                  <span>Added</span>
                </Badge>
                <ul className='text-textSecondary mis-6 flex list-disc flex-col text-base'>
                  <li>
                    <span className='font-semibold'>Documentation:</span> Preline JavaScript
                  </li>
                  <li>
                    <span className='font-semibold'>Component Plugin:</span> ComboBox (Autocomplete)
                  </li>
                  <li>
                    <span className='font-semibold'>Component Plugin:</span> Searchbox
                  </li>
                  <li>
                    <span className='font-semibold'>Component Plugin:</span> PIN Input - Show PIN code suggest on iOS
                    keyboard - [Issue #188 by @hieuhuynh93]
                  </li>
                  <li>
                    <span className='font-semibold'>Textarea:</span> Modal example
                  </li>
                  <li>
                    <span className='font-semibold'>Input Number:</span> Step Controls
                  </li>
                  <li>
                    <span className='font-semibold'>Input Number:</span> Negative value
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
