// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import { TbCheck } from 'react-icons/tb'

// Component Imports
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

type Props = {
  icon: ReactNode
  content: string
  title: ReactNode
  description: ReactNode
  image: ImageType | ReactNode
  imageDirection?: 'left' | 'right'
  features: string[]
  className?: string
  transitionDelay?: number
  transitionDuration?: number
}

const FeaturesImageGradient = (props: Props) => {
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
      <div className='max-lg:max-is-2xl flex flex-col gap-6 self-start'>
        <div className='flex flex-col items-start gap-3'>
          <MotionFadeElement
            component='div'
            variants={{
              hidden: { x: imageDirection === 'left' ? 30 : -30 },
              show: { transition: { delay: transitionDelay, duration: transitionDuration }, x: 0 }
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
              hidden: { x: imageDirection === 'left' ? 30 : -30 },
              show: {
                transition: { delay: transitionDelay + (transitionDuration - 0.1), duration: transitionDuration },
                x: 0
              }
            }}
            className='text-textPrimary text-3xl font-semibold sm:text-4xl sm:leading-[44px]'
          >
            {title}
          </MotionFadeElement>
          <MotionFadeElement
            component='p'
            variants={{
              hidden: { x: imageDirection === 'left' ? 30 : -30 },
              show: {
                transition: { delay: transitionDelay + (transitionDuration - 0.1) * 2, duration: transitionDuration },
                x: 0
              }
            }}
            className='text-textSecondary text-base'
          >
            {description}
          </MotionFadeElement>
        </div>
        <MotionFadeElement
          component='ul'
          variants={{
            hidden: { x: imageDirection === 'left' ? 30 : -30 },
            show: {
              transition: { delay: transitionDelay + (transitionDuration - 0.1) * 3, duration: transitionDuration },
              x: 0
            }
          }}
          className='space-b-2 sm:space-b-4'
        >
          {features.map((feature, i) => (
            <li key={i} className='plb-1 pli-2 flex items-center gap-1.5'>
              <TbCheck className='text-textSecondary text-2xl' />
              <p className='text-textSecondary text-lg font-semibold'>{feature}</p>
            </li>
          ))}
        </MotionFadeElement>
      </div>
      <MotionFadeElement
        component='div'
        variants={{
          hidden: { x: imageDirection === 'left' ? -30 : 30 },
          show: { transition: { delay: transitionDelay, duration: transitionDuration }, x: 0 }
        }}
        className={cn('from-primary/[0.12] to-destructive/[0.12] rounded-3xl bg-gradient-to-r p-4 sm:p-6', {
          'order-first': imageDirection === 'left'
        })}
      >
        {image && typeof image === 'object' && 'srcLight' in image && 'srcDark' in image ? (
          <Image
            srcLight={image.srcLight}
            srcDark={image.srcDark}
            alt={image.alt ?? 'Feature Image'}
            className={cn('rounded-xl', image.className)}
          />
        ) : (
          image
        )}
      </MotionFadeElement>
    </div>
  )
}

export default FeaturesImageGradient
