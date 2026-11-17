'use client'

import { TbPrinter } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'

const FormPrintButton = () => (
  <Button type='button' onClick={() => window.print()}>
    <TbPrinter />
    Print or save as PDF
  </Button>
)

export default FormPrintButton
