// Next Imports
import type { Metadata } from 'next'

// Component Imports
import Details from './Details'
import HeaderSection from './HeaderSection'

export const metadata: Metadata = {
  title: 'Changelog',
  alternates: {
    canonical: 'https://demos.themeselection.com/jetship-nextjs-starter-kit-demo/changelog'
  }
}

const Changelog = () => {
  return (
    <>
      <HeaderSection />
      <Details />
    </>
  )
}

export default Changelog
