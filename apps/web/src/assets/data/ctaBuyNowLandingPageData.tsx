// Next Imports
import Link from 'next/link'

// Third-party Imports
import { TbDownload } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import Trans from '@repo/i18n/Trans'

// SVG Imports
import Logo from '@/assets/svg/Logo'

const data = {
  logo: <Logo className='text-primary text-5xl' />,
  content: (
    <>
      <div className='text-lg text-white sm:text-xl'>
        <Trans i18nKey='data:readyToElevate' />
      </div>
      <h2 className='text-2xl font-semibold text-white sm:text-3xl'>
        <Trans i18nKey='data:journeyStarts' />
      </h2>
      <p className='text-base text-white'>
        <Trans i18nKey='data:automateDescription' />
      </p>
    </>
  ),
  button: (
    <Button
      size='lg'
      variant='tonal'
      className='max-sm:is-full text-wrap bg-[#9880FF] text-white shadow hover:bg-[#8364ff] hover:shadow-md active:bg-[#8364ff]'
      asChild
    >
      <Link href='/#pricing-section'>
        <Trans i18nKey='data:getStartedButton' /> <TbDownload className='shrink-0 text-xl' />
      </Link>
    </Button>
  ),
  image: (
    <img
      src='/images/pages/cta-banner.png'
      alt='CTA Banner'
      className='lg:-block-end-9 max-lg:-mbe-9 lg:absolute lg:end-0'
    />
  )
}

export default data
