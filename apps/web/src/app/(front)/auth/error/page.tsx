// Next Imports
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { absolute: 'Error' },
  alternates: {
    canonical: 'https://demos.themeselection.com/jetship-nextjs-starter-kit-demo'
  }
}

const ErrorPage = () => {
  return <p>Sorry, something went wrong!</p>
}

export default ErrorPage
