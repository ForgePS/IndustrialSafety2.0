'use client'

import { TbPrinter } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'

const PrintButton = () => (
  <Button type='button' onClick={() => window.print()}>
    <TbPrinter />
    Print or save as PDF
  </Button>
)

export default PrintButton
