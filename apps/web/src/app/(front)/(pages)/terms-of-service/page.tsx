// Next Imports
import type { Metadata } from 'next'

// Component Imports
import HeaderSection from './HeaderSection'
import Details from './Details'

export const metadata: Metadata = {
  title: 'Terms of Service',
  alternates: {
    canonical: 'https://demos.themeselection.com/jetship-nextjs-starter-kit-demo/terms-of-service'
  }
}

const TermsOfServicePage = () => {
  return (
    <>
      <HeaderSection />
      <Details />
    </>
  )
}

export default TermsOfServicePage
