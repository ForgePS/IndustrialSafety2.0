'use client'

// React Imports
import { useState, useEffect } from 'react'

// Third-party Imports
import { TbRocket } from 'react-icons/tb'
import { useMedia } from 'react-use'

// Components Imports
import { Ratings } from '@repo/ui/components/ui/ratings'
import { MotionElement, MotionFadeElement } from '@repo/ui/components/ui/motion-element'
import AvatarGroup from '@repo/ui/components/ui/avatar-group'
import RainbowButton from '@repo/ui/components/ui/rainbow-button'
import Image from '@repo/ui/components/Image'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

// Styles Imports
import frontCommonStyles from '@repo/ui/blocks/styles.module.css'

// Vars
const avatarUrls = ['/images/avatars/1.png', '/images/avatars/2.png', '/images/avatars/3.png', '/images/avatars/4.png']

const HeroVerticalGradient = () => {
  // States
  const [dashboardPosition, setDashboardPosition] = useState({ x: 0, y: 0 })
  const [elementsPosition, setElementsPosition] = useState({ x: 0, y: 0 })

  // Hooks
  const isLgScreen = useMedia('(max-width: 1024px)', false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const speedDashboard = 2
      const speedElements = 2.5

      const updateMousePosition = (ev: MouseEvent) => {
        const x = ev.clientX
        const y = ev.clientY

        setDashboardPosition({
          x: (window.innerWidth - x * speedDashboard) / 100,
          y: Math.max((window.innerHeight - y * speedDashboard) / 100, -40)
        })

        setElementsPosition({
          x: (window.innerWidth - x * speedElements) / 100,
          y: Math.max((window.innerHeight - y * speedElements) / 100, -40)
        })
      }

      window.addEventListener('mousemove', updateMousePosition)

      return () => {
        window.removeEventListener('mousemove', updateMousePosition)
      }
    }
  }, [])

  return (
    <section className='p-4 sm:p-6 md:p-8'>
      <div className='from-primary/[0.12] to-destructive/[0.12] plb-10 sm:plb-16 lg:plb-20 rounded-3xl bg-gradient-to-r'>
        <div className={cn('flex flex-col gap-6 sm:gap-10 md:gap-14', frontCommonStyles.layoutSpacing)}>
          <div>
            <div className='flex flex-col items-center gap-5'>
              <MotionFadeElement
                component='div'
                variants={{
                  hidden: { y: 30 },
                  show: { transition: { delay: 0.2, duration: 0.4 }, y: 0 }
                }}
                className='relative inline-block'
              >
                <h1 className='text-textPrimary text-center text-3xl font-bold sm:text-4xl md:text-5xl md:leading-[1.2]'>
                  <span className='from-primary to-destructive bg-gradient-to-r bg-clip-text [-webkit-text-fill-color:transparent]'>
                    Effortless SaaS
                  </span>{' '}
                  🚀
                  <br />
                  Launch Like a Pro in Days
                </h1>
              </MotionFadeElement>
              <MotionFadeElement
                component='p'
                variants={{
                  hidden: { y: 30 },
                  show: { transition: { delay: 0.5, duration: 0.4 }, y: 0 }
                }}
                className='text-textSecondary sm:is-5/6 md:is-1/2 xl:is-1/3 text-lg font-semibold sm:text-xl sm:leading-[1.4]'
              >
                Ship Faster and Focus on Growth with the
                <br />
                All-In-One{' '}
                <span className='text-primary relative'>
                  Tech Stack
                  <span className='bs-0.5 is-full -block-end-0.5 from-primary/40 to-primary/0 absolute start-0 rounded-full bg-gradient-to-r font-bold' />
                </span>{' '}
                Boilerplate.
              </MotionFadeElement>
              <MotionFadeElement
                component='div'
                variants={{
                  hidden: { y: 30 },
                  show: { transition: { delay: 0.8, duration: 0.4 }, y: 0 }
                }}
                className='flex items-center gap-3'
              >
                <AvatarGroup size='3xl' limit={4} avatarUrls={avatarUrls} />
                <div className='flex flex-col items-start gap-1'>
                  <p className='text-textPrimary text-sm leading-4'>Loved by great clients</p>
                  <Ratings rating={5} disabled />
                </div>
              </MotionFadeElement>
            </div>
            <MotionFadeElement
              component='div'
              variants={{
                hidden: { y: 30 },
                show: { transition: { delay: 1.1, duration: 0.4 }, y: 0 }
              }}
              className='mbs-8 sm:mbs-12 flex max-sm:flex-col sm:justify-center'
            >
              <RainbowButton size='lg' className='!plb-2.5'>
                Get Started Now
                <TbRocket className='text-xl' />
              </RainbowButton>
            </MotionFadeElement>
          </div>
          <MotionElement
            component='div'
            initial='hidden'
            whileInView='show'
            viewport={{ once: true }}
            variants={{
              hidden: { opacity: 0 },
              show: { opacity: 1, transition: { delay: 1.4, duration: 0.4 } }
            }}
            style={{
              transform: isLgScreen ? 'none' : `translate(${dashboardPosition.x}px, ${dashboardPosition.y}px)`
            }}
            className='plb-9 sm:plb-16 md:plb-20 lg:plb-24 xl:plb-28 relative'
          >
            <Image
              srcLight='/images/blocks/hero/hero-dashboard-v2-light.png'
              srcDark='/images/blocks/hero/hero-dashboard-v2-dark.png'
              className='mli-auto is-[80%] sm:is-[75%] lg:is-[85%] xl:is-auto'
            />
            <div className='absolute inset-0'>
              <Image
                srcLight='/images/blocks/hero/hero-dashboard-icons-v2-light.png'
                srcDark='/images/blocks/hero/hero-dashboard-icons-v2-dark.png'
                style={{
                  transform: isLgScreen ? 'none' : `translate(${elementsPosition.x}px, ${elementsPosition.y}px)`
                }}
                className='mli-auto bs-full max-bs-full'
              />
            </div>
          </MotionElement>
        </div>
      </div>
    </section>
  )
}

export default HeroVerticalGradient
