'use client'

// React Imports
import { useState } from 'react'
import type { ReactNode } from 'react'

// Third-party Imports
import * as Icons from 'react-icons/tb'

// Type Imports
import type { Plan } from '@/types/billingConfigTypes'

// Component Imports
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Label } from '@repo/ui/components/ui/label'
import { Switch } from '@repo/ui/components/ui/switch'
import { MotionFadeElement } from '@repo/ui/components/ui/motion-element'
import NumberTicker from '@repo/ui/components/ui/number-ticker'
import ShimmerButton from '@repo/ui/components/ui/shimmer-button'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

type Props = {
  title: ReactNode
  description?: ReactNode
  data: Plan[]
  className?: string
  transitionDelay?: number
  transitionDuration?: number
}

// To render dynamic icons
const DynamicIcon = (icon: keyof typeof Icons) => {
  // eslint-disable-next-line import/namespace
  const IconComponent = Icons[icon]

  if (!IconComponent) return null

  return <IconComponent className='min-is-fit text-[38px]' />
}

const PricingSubscription = (props: Props) => {
  // Props
  const { title, description, data, className, transitionDelay = 0.2, transitionDuration = 0.4 } = props

  // States
  const [isAnnually, setIsAnnually] = useState<boolean>(false)

  return (
    <div className={cn('flex flex-col gap-8 sm:gap-12 md:gap-24', className)}>
      <div className='flex flex-col items-center gap-6'>
        <div className='flex flex-col items-center gap-3'>
          <MotionFadeElement
            component='h2'
            variants={{
              hidden: { y: 30 },
              show: { transition: { delay: transitionDelay, duration: transitionDuration }, y: 0 }
            }}
            className='text-2xl font-semibold sm:text-3xl'
          >
            {title}
          </MotionFadeElement>
          {description && (
            <MotionFadeElement
              component='div'
              variants={{
                hidden: { y: 30 },
                show: {
                  transition: { delay: transitionDelay + (transitionDuration - 0.1), duration: transitionDuration },
                  y: 0
                }
              }}
              className='text-textSecondary flex flex-col items-center gap-3 text-center text-base'
            >
              {description}
            </MotionFadeElement>
          )}
        </div>
        <MotionFadeElement
          component='div'
          variants={{
            hidden: { y: 30 },
            show: {
              transition: { delay: transitionDelay + (transitionDuration - 0.1) * 2, duration: transitionDuration },
              y: 0
            }
          }}
          className='flex items-start gap-3'
        >
          <Label htmlFor='pricing-subscription-1' className='text-textSecondary text-base font-medium'>
            Monthly
          </Label>
          <Switch id='pricing-subscription-1' checked={isAnnually} onCheckedChange={value => setIsAnnually(value)} />
          <Label htmlFor='pricing-subscription-1' className='text-textSecondary text-base font-medium'>
            Annually
          </Label>
        </MotionFadeElement>
      </div>
      <div className='flex justify-center gap-6 max-lg:flex-col max-lg:items-center'>
        {data.slice(0, 6).map((plan, index) => (
          <MotionFadeElement
            key={index}
            component='div'
            variants={{
              hidden: { y: 30 },
              show: {
                transition: {
                  delay: transitionDelay + (transitionDuration - 0.1) * (index + 3),
                  duration: transitionDuration - 0.1
                },
                y: 0
              }
            }}
            className={cn(
              'bg-card max-lg:max-is-lg is-full plb-8 pli-6 flex basis-[calc(33.333333%-16px)] flex-col gap-6 rounded-xl bg-no-repeat [background-image:url(/images/blocks/pricing/pricing-v2-shape.png)] [background-position:right_top_25%] sm:gap-8',
              {
                border: !plan.highlighted,
                'border-primary shadow-lg [border-block-start-width:4px]': plan.highlighted
              }
            )}
          >
            {plan.badge ? (
              <div className='flex items-start justify-between'>
                <Avatar
                  shape='circle'
                  color='primary'
                  className={cn('bs-[70px] is-[70px]', { 'bg-primary text-white': plan.highlighted })}
                >
                  <AvatarFallback>{plan.icon && DynamicIcon(plan.icon)}</AvatarFallback>
                </Avatar>
                <Badge variant='tonalPrimary'>{plan.badge}</Badge>
              </div>
            ) : (
              <Avatar
                shape='circle'
                color='primary'
                className={cn('bs-[70px] is-[70px]', { 'bg-primary text-white': plan.highlighted })}
              >
                <AvatarFallback>{plan.icon && DynamicIcon(plan.icon)}</AvatarFallback>
              </Avatar>
            )}
            <div>
              <h2 className='text-primary mbe-3 text-2xl font-bold sm:text-3xl'>{plan.name}</h2>
              <div className='flex gap-0.5'>
                <span className='text-textSecondary self-start text-base font-medium'>$</span>
                <NumberTicker
                  startValue={plan.variants.find(p => p.interval === 'monthly')?.lineItems[0].cost as number}
                  endValue={plan.variants.find(p => p.interval === 'yearly')?.lineItems[0].cost as number}
                  increaseValue={isAnnually}
                  className='text-textPrimary text-4xl font-bold sm:text-5xl'
                />
                <span className='text-textSecondary self-end text-base'>{`/${isAnnually ? 'year' : 'month'}`}</span>
              </div>
            </div>
            <div>
              <ul className='space-b-3 mbe-4'>
                {plan.features?.map((feature, i) => (
                  <li key={i} className='plb-1 flex items-center gap-2.5'>
                    <Icons.TbCircleCheck className='text-primary min-is-fit text-2xl' />
                    <p className='text-textSecondary text-base font-normal'>{feature}</p>
                  </li>
                ))}
              </ul>
              {plan.highlighted ? (
                <ShimmerButton size='lg' className='is-full'>
                  {plan.name}
                </ShimmerButton>
              ) : (
                <Button size='lg' variant='tonal' className='is-full'>
                  {plan.name}
                </Button>
              )}
            </div>
          </MotionFadeElement>
        ))}
      </div>
    </div>
  )
}

export default PricingSubscription
