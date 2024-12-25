'use client'

import type { ComponentProps } from 'react'

import { Trans as TransComponent } from 'react-i18next'

export default function Trans(props: ComponentProps<typeof TransComponent>) {
  return <TransComponent {...props} />
}
