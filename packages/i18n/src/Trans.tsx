'use client'

import type { ComponentProps } from 'react'

import { Trans as TransComponent, useTranslation } from 'react-i18next'

export default function Trans(props: ComponentProps<typeof TransComponent>) {
  const { ready } = useTranslation()

  if (!ready) return null

  return <TransComponent {...props} />
}
