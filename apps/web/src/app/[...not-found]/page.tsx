// Next Imports
import { notFound } from 'next/navigation'

// Unknown URLs (including removed template pages) render app/not-found.tsx with a real 404 status.
const CatchAllPage = () => {
  notFound()
}

export default CatchAllPage
