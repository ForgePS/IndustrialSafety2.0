// React Imports
import type { ReactNode } from 'react'

// Component Imports
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@repo/ui/components/ui/accordion'
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar'
import { MotionFadeElement } from '@repo/ui/components/ui/motion-element'
import Image from '@repo/ui/components/Image'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

type ImageType = {
  srcLight: string
  srcDark: string
  alt?: string
  className?: string
}

type FeatureType = {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
}

type Props = {
  icon: ReactNode
  content: string
  title: ReactNode
  description: ReactNode
  image: ImageType | ReactNode
  imageDirection?: 'left' | 'right'
  features: FeatureType[]
  className?: string
  transitionDelay?: number
  transitionDuration?: number
}

const FeaturesImageAccordion = (props: Props) => {
  // Props
  const {
    icon,
    content,
    title,
    description,
    image,
    imageDirection = 'left',
    features,
    className,
    transitionDelay = 0.2,
    transitionDuration = 0.4
  } = props

  return (
    <div className={cn('grid place-items-center gap-12 sm:gap-16 lg:grid-cols-2 lg:gap-20', className)}>
      <div className='max-lg:max-is-2xl flex flex-col gap-6'>
        <div className='flex flex-col items-start gap-2'>
          <MotionFadeElement
            component='div'
            variants={{
              hidden: { y: 30 },
              show: { transition: { delay: transitionDelay, duration: transitionDuration }, y: 0 }
            }}
            className='flex items-center gap-4'
          >
            <Avatar size='2xl' color='primary' className='bg-primary/10'>
              <AvatarFallback>{icon}</AvatarFallback>
            </Avatar>
            <h4 className='text-primary text-xl font-semibold'>{content}</h4>
          </MotionFadeElement>
          <MotionFadeElement
            component='h2'
            variants={{
              hidden: { y: 30 },
              show: {
                transition: { delay: transitionDelay + (transitionDuration - 0.1), duration: transitionDuration },
                y: 0
              }
            }}
            className='text-textPrimary text-3xl font-semibold sm:text-4xl sm:leading-[44px]'
          >
            {title}
          </MotionFadeElement>
          <MotionFadeElement
            component='p'
            variants={{
              hidden: { y: 30 },
              show: {
                transition: { delay: transitionDelay + (transitionDuration - 0.1) * 2, duration: transitionDuration },
                y: 0
              }
            }}
            className='text-textDisabled text-base'
          >
            {description}
          </MotionFadeElement>
        </div>
        <MotionFadeElement
          component='div'
          variants={{
            hidden: { y: 30 },
            show: {
              transition: { delay: transitionDelay + (transitionDuration - 0.1) * 3, duration: transitionDuration },
              y: 0
            }
          }}
        >
          <Accordion type='single' collapsible defaultValue='feature-1' className='is-full' variant='split'>
            {features.map((feature, i) => (
              <AccordionItem key={i} value={`feature-${i + 1}`}>
                <AccordionTrigger>
                  <div className='flex items-center gap-4 text-lg font-semibold'>
                    {feature.icon}
                    {feature.title}
                  </div>
                </AccordionTrigger>
                <AccordionContent className='text-textSecondary'>{feature.description}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </MotionFadeElement>
      </div>
      <MotionFadeElement
        component='div'
        variants={{
          hidden: { x: imageDirection === 'left' ? -30 : 30 },
          show: { transition: { delay: transitionDelay, duration: transitionDuration }, x: 0 }
        }}
        className={cn('bg-primary/10 max-lg:max-is-2xl pbs-8 sm:pbs-14 pli-4 sm:pli-6 rounded-3xl', {
          'order-first': imageDirection === 'left'
        })}
      >
        {image && typeof image === 'object' && 'srcLight' in image && 'srcDark' in image ? (
          <Image
            srcLight={image.srcLight}
            srcDark={image.srcDark}
            alt={image.alt ?? 'Feature Image'}
            className={cn('rounded-bs-xl', image.className)}
          />
        ) : (
          image
        )}
      </MotionFadeElement>
    </div>
  )
}

export default FeaturesImageAccordion
