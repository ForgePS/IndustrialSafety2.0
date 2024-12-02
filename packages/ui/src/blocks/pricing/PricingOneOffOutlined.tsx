// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import { TbCircleCheck } from 'react-icons/tb'

// Type Imports
import type { Plan } from '@/types/billingConfigTypes'

// Component Imports
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { MotionFadeElement } from '@repo/ui/components/ui/motion-element'
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

const PricingOneOffOutlined = (props: Props) => {
  // Props
  const { title, description, data, className, transitionDelay = 0.2, transitionDuration = 0.4 } = props

  return (
    <div className={cn('flex flex-col gap-8 sm:gap-12 md:gap-24', className)}>
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
      <div className='flex justify-center gap-6 max-lg:flex-col max-lg:items-center'>
        {data.slice(0, 6).map((plan, index) => (
          <MotionFadeElement
            key={index}
            component='div'
            variants={{
              hidden: { y: 30 },
              show: {
                transition: {
                  delay: transitionDelay + (transitionDuration - 0.1) * (index + 2),
                  duration: transitionDuration - 0.1
                },
                y: 0
              }
            }}
            className={cn(
              'bg-card max-lg:max-is-lg is-full pbs-12 relative flex basis-[calc(33.333333%-16px)] flex-col gap-6 rounded-xl border p-6 sm:gap-8',
              {
                'border-primary bg-primary/10': plan.highlighted
              }
            )}
          >
            {plan.badge && <Badge className='bg-neutral text-card absolute end-3 top-4'>{plan.badge}</Badge>}
            <div>
              <h2 className='text-primary mbe-6 text-2xl font-bold sm:text-3xl'>{plan.name}</h2>
              <div className='flex gap-0.5'>
                <span
                  className={cn('text-textSecondary self-start text-lg font-medium', {
                    'text-primary': plan.highlighted
                  })}
                >
                  $
                </span>
                <span
                  className={cn('text-textPrimary text-5xl font-bold sm:text-6xl', {
                    'text-primary': plan.highlighted
                  })}
                >
                  {plan.variants[0].lineItems[0].cost}
                </span>
              </div>
            </div>
            {plan.highlighted ? (
              <ShimmerButton shape='rounded' size='lg' className='is-full'>
                {plan.name}
              </ShimmerButton>
            ) : (
              <Button shape='rounded' size='lg' variant='tonal' className='is-full'>
                {plan.name}
              </Button>
            )}
            <ul className='space-b-3'>
              {plan.variants[0].features?.map((feature, i) => (
                <li key={i} className='plb-1 flex items-center gap-2.5'>
                  <TbCircleCheck className='text-primary min-is-fit text-2xl' />
                  <p
                    className={cn('text-textSecondary text-base font-normal', {
                      'text-primary': plan.highlighted
                    })}
                  >
                    {feature}
                  </p>
                </li>
              ))}
            </ul>
          </MotionFadeElement>
        ))}
      </div>
    </div>
  )
}

export default PricingOneOffOutlined
