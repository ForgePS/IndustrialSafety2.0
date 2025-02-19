// Next Imports
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { absolute: 'Error' },
  alternates: {
    canonical: 'https://jetship-nextjs-saas-boilerplate-demo.vercel.app/auth/error'
  }
}

const ErrorPage = () => {
  return <p>Sorry, something went wrong!</p>
}

export default ErrorPage
