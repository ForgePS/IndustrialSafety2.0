'use client'

// React Imports
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

// Component Imports
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar'
import BlurFade from '@repo/ui/components/ui/blur-fade'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

type Props = {
  data: { icon: ReactNode; title: string; description: string }[]
  className?: string
  transitionDelay?: number
  transitionDuration?: number
}

const AdditionalFeaturesOutlined = (props: Props) => {
  // Props
  const { data, className, transitionDelay = 0.2, transitionDuration = 0.05 } = props

  // States
  const [hoveredCard, setHoveredCard] = useState<number | null>(null)

  useEffect(() => {
    const all = document.querySelectorAll('.card')

    const handleMouseMove = (ev: MouseEvent) => {
      all.forEach(e => {
        const blob = e.querySelector('.blob') as HTMLElement
        const fblob = e.querySelector('.fake-blob') as HTMLElement

        if (!blob || !fblob) return

        const rec = fblob.getBoundingClientRect()

        blob.style.opacity = '1'

        blob.animate(
          [
            {
              transform: `translate(${
                ev.clientX - rec.left - rec.width / 2
              }px, ${ev.clientY - rec.top - rec.height / 2}px)`
            }
          ],
          {
            duration: 300,
            fill: 'forwards'
          }
        )
      })
    }

    window.addEventListener('mousemove', handleMouseMove)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

  return (
    <div className={cn('grid gap-6 md:grid-cols-2 lg:grid-cols-3', className)}>
      {data.map((item, index) => (
        <BlurFade
          key={index}
          delay={transitionDelay + index * transitionDuration}
          inView
          className='card bg-border [&:hover>.inner]:bg-card/85 relative z-0 flex overflow-hidden rounded-xl p-px [transition:all_300ms_ease-in-out]'
          onMouseEnter={() => setHoveredCard(index)}
          onMouseLeave={() => setHoveredCard(null)}
        >
          <div className='inner bg-card is-full flex items-start gap-6 rounded-[11px] p-6 [transition:all_300ms_ease-in-out]'>
            <Avatar
              size='2xl'
              color={hoveredCard === index ? 'primary' : 'default'}
              className={cn('transition-colors duration-300 ease-in-out', {
                'bg-neutral/10 text-foreground': hoveredCard !== index
              })}
            >
              <AvatarFallback>{item.icon}</AvatarFallback>
            </Avatar>
            <div className='flex flex-col items-start gap-1.5'>
              <h5 className='text-textPrimary text-lg font-semibold'>{item.title}</h5>
              <p className='text-textSecondary text-base font-medium'>{item.description}</p>
            </div>
          </div>
          <div className='blob block-start-0 bg-primary/90 is-60 bs-60 absolute start-0 z-[-1] rounded-full opacity-0 blur-2xl [transition:all_300ms_ease-in-out]'></div>
          <div className='fake-blob block-start-0 is-48 bs-48 absolute start-0 z-[-1] rounded-full [display:hidden]'></div>
        </BlurFade>
      ))}
    </div>
  )
}

export default AdditionalFeaturesOutlined
