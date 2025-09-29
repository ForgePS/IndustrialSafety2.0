'use client'

// React Imports
import { useRef } from 'react'
import type { MouseEventHandler, ReactNode } from 'react'

// Third-party Imports
import { AnimatePresence, motion, useInView } from 'motion/react'
import type { UseInViewOptions, Variants } from 'motion/react'

type BlurFadeProps = {
  children: ReactNode
  className?: string
  variant?: {
    hidden: { y: number }
    visible: { y: number }
  }
  duration?: number
  delay?: number
  yOffset?: number
  inView?: boolean
  inViewMargin?: UseInViewOptions['margin']
  blur?: string
  onMouseEnter?: MouseEventHandler<HTMLDivElement>
  onMouseLeave?: MouseEventHandler<HTMLDivElement>
}

const BlurFade = (props: BlurFadeProps) => {
  // Props
  const {
    children,
    className,
    variant,
    duration = 0.4,
    delay = 0,
    yOffset = 12,
    inView = true,
    inViewMargin = '-50px',
    blur = '6px',
    onMouseEnter,
    onMouseLeave
  } = props

  // Refs
  const ref = useRef(null)

  // Hooks
  const inViewResult = useInView(ref, { once: true, margin: inViewMargin })
  const isInView = !inView || inViewResult

  const defaultVariants: Variants = {
    hidden: { y: yOffset, opacity: 0, filter: `blur(${blur})` },
    visible: { y: 0, opacity: 1, filter: `blur(0px)` }
  }

  const combinedVariants = variant || defaultVariants

  return (
    <AnimatePresence>
      <motion.div
        ref={ref}
        initial='hidden'
        animate={isInView ? 'visible' : 'hidden'}
        exit='hidden'
        variants={combinedVariants}
        transition={{
          delay,
          duration,
          ease: 'easeOut'
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

export default BlurFade
