'use client'

// React Imports
import { useEffect, useState } from 'react'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const Meteors = ({ number = 20 }: { number?: number }) => {
  const [meteorStyles, setMeteorStyles] = useState<Array<React.CSSProperties>>([])

  useEffect(() => {
    const styles = [...new Array(number)].map(() => ({
      top: -5,
      left: Math.floor(Math.random() * window.innerWidth) + 'px',
      animationDelay: Math.random() * 1 + 0.2 + 's',
      animationDuration: Math.floor(Math.random() * 8 + 2) + 's'
    }))

    setMeteorStyles(styles)
  }, [number])

  return (
    <>
      {[...meteorStyles].map((style, idx) => (
        <span
          key={idx}
          className={cn(
            'block-start-1/2 animate-meteor pointer-events-none absolute start-1/2 size-0.5 rotate-[215deg] rounded-full bg-[#9880ff] shadow-[0_0_0_1px_#ffffff10]'
          )}
          style={style}
        >
          <div className='block-start-1/2 pointer-events-none absolute -z-10 h-px w-[50px] -translate-y-1/2 bg-gradient-to-r from-[#9880ff] to-transparent' />
        </span>
      ))}
    </>
  )
}

export default Meteors
