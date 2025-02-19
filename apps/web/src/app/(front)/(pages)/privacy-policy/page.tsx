// Next Imports
import type { Metadata } from 'next'

// Component Imports
import HeaderSection from './HeaderSection'
import Details from './Details'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  alternates: {
    canonical: 'https://jetship-nextjs-saas-boilerplate-demo.vercel.app/privacy-policy'
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
