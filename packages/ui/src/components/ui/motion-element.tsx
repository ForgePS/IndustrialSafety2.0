'use client'

// React Imports
import type { ElementType } from 'react'

// Third-party Imports
import { motion } from 'framer-motion'
import type { MotionProps } from 'framer-motion'

type Props = {
  component: keyof typeof motion
  className?: string
} & MotionProps

export const MotionFadeElement = (props: Props) => {
  // Props
  const {
    component,
    className,
    children,
    initial,
    whileInView,
    viewport = { once: true },
    variants = {
      hidden: { opacity: 0 },
      show: { opacity: 1, transition: { type: 'spring' } }
    },
    ...rest
  } = props

  // Vars
  const MotionComponent = motion[component] as ElementType

  const { hidden, show, ...restVariants } = variants as {
    [name: string]: { [name: string]: number; opacity: number }
  }

  return children ? (
    <MotionComponent
      initial={initial ?? 'hidden'}
      whileInView={whileInView ?? 'show'}
      viewport={viewport}
      variants={{
        ...restVariants,
        hidden: {
          ...(hidden ?? {}),
          opacity: hidden?.opacity ?? 0
        },
        show: {
          ...(show ?? {}),
          opacity: show?.opacity ?? 1
        }
      }}
      className={className}
      {...rest}
    >
      {children}
    </MotionComponent>
  ) : (
    <MotionComponent className={className} {...rest} />
  )
}

export const MotionElement = ({ component, className, children, ...rest }: Props) => {
  // Vars
  const MotionComponent = motion[component] as ElementType

  return children ? (
    <MotionComponent className={className} {...rest}>
      {children}
    </MotionComponent>
  ) : (
    <MotionComponent className={className} {...rest} />
  )
}
