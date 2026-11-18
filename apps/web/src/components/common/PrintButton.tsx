'use client'

import { Button } from '@repo/ui/components/ui/button'

const PrintButton = () => (
  <Button className='print:hidden' onClick={() => window.print()}>
    Print
  </Button>
)

export default PrintButton
