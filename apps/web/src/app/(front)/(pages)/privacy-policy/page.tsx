// Next Imports
import type { Metadata } from 'next'

// Component Imports
import HeaderSection from './HeaderSection'
import Details from './Details'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  alternates: {
    canonical: 'https://demos.themeselection.com/jetship-nextjs-starter-kit-demo/privacy-policy'
  }
}

const PrivacyPolicyPage = () => {
  return (
    <>
      <HeaderSection />
      <Details />
    </>
  )
}

export default PrivacyPolicyPage
