// Third-party Imports
import { TbDownload } from 'react-icons/tb'

// SVG Imports
import Logo from '@/assets/svg/Logo'

const data = {
  logo: <Logo className='text-primary text-5xl' />,
  content: (
    <>
      <div className='text-lg text-white sm:text-xl'>Ready to Elevate Your Customer Support?</div>
      <h2 className='text-2xl font-semibold text-white sm:text-3xl'>Your Journey with ChatFlow AI Starts Here.</h2>
      <p className='text-base text-white'>
        Automate, engage, and delight your customers effortlessly. Save time and boost satisfaction with ChatFlow AI.
      </p>
    </>
  ),
  button: (
    <>
      Get Started with ChatFlow AI Now <TbDownload className='text-xl' />
    </>
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
