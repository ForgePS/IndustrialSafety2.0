'use client'

// React Imports
import { useEffect, useState } from 'react'
import type { ImgHTMLAttributes } from 'react'

// Third-party imports
import { useTheme } from 'next-themes'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  srcLight: string
  srcDark: string
}

const Image = ({ srcLight, srcDark, ...rest }: Props) => {
  // State
  const [mounted, setMounted] = useState(false)

  // Hooks
  const { resolvedTheme } = useTheme()

  useEffect(() => setMounted(true), [])

  return <>{mounted && <img src={resolvedTheme === 'dark' ? srcDark : srcLight} {...rest} />}</>
}

export default Image
