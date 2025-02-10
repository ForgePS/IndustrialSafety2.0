// Next Imports
import type { Metadata } from 'next'

// Component Imports
import Create from './Create'

export const metadata: Metadata = {
  title: 'Create FAQ Category'
}

const CreatePage = () => {
  return <Create />
}

export default CreatePage
