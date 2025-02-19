'use client'

// React Imports
import { useEffect, useState } from 'react'
import type { ComponentProps } from 'react'

// Third-party Imports
import { Trans as TransComponent, useTranslation } from 'react-i18next'

export default function Trans(props: ComponentProps<typeof TransComponent>) {
  // States
  const [isMounted, setIsMounted] = useState(false)
  const { ready } = useTranslation()

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!ready || !isMounted) return null

  return <TransComponent {...props} />
}
