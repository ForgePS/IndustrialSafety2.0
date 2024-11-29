'use client'

// React Imports
import { useEffect, useRef } from 'react'

// Third-party Imports
import { useInView, useMotionValue, useSpring } from 'framer-motion'

type NumberTickerProps = {
  startValue: number
  endValue: number
  increaseValue?: boolean
  delay?: number
  className?: string
  decimalPlaces?: number
}

const NumberTicker = (props: NumberTickerProps) => {
  // Props
  const { startValue, endValue, increaseValue = true, delay = 0, className, decimalPlaces = 0 } = props

  // Refs
  const ref = useRef<HTMLSpanElement>(null)

  // Hooks
  const motionValue = useMotionValue(increaseValue ? startValue : endValue)

  const springValue = useSpring(motionValue, {
    damping: 30,
    stiffness: 250
  })

  const isInView = useInView(ref, { once: true, margin: '0px' })

  useEffect(() => {
    isInView &&
      setTimeout(() => {
        motionValue.set(increaseValue ? endValue : startValue)
      }, delay * 1000)
  }, [motionValue, isInView, delay, startValue, endValue, increaseValue])

  useEffect(
    () =>
      springValue.on('change', latest => {
        if (ref.current) {
          ref.current.textContent = Intl.NumberFormat('en-US', {
            minimumFractionDigits: decimalPlaces,
            maximumFractionDigits: decimalPlaces
          }).format(Number(latest.toFixed(decimalPlaces)))
        }
      }),
    [springValue, decimalPlaces]
  )

  return <span ref={ref} className={className} />
}

export default NumberTicker
