// React Imports
import type { ReactNode } from 'react'

// Component Imports
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar'
import { MotionFadeElement } from '@repo/ui/components/ui/motion-element'
import BorderBeam from '@repo/ui/components/ui/border-beam'
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
  title: ReactNode
  description: ReactNode
  image: ImageType | ReactNode
  imageDirection?: 'left' | 'right'
  features: FeatureType[]
  className?: string
  animationDelay?: number
  transitionDelay?: number
  transitionDuration?: number
}

const FeaturesImageOutlined = (props: Props) => {
  // Props
  const {
    icon,
    title,
    description,
    image,
    imageDirection = 'left',
    features,
    className,
    animationDelay = 0,
    transitionDelay = 0.2,
    transitionDuration = 0.4
  } = props

  return (
    <MotionFadeElement
      component='div'
      variants={{
        hidden: { y: 30 },
        show: { transition: { delay: transitionDelay, duration: transitionDuration }, y: 0 }
      }}
      className={cn('relative grid gap-10 rounded-xl border p-6 sm:p-8 lg:grid-cols-2 lg:p-12', className)}
    >
      <MotionFadeElement
        component='div'
        variants={{
          hidden: { y: 20 },
          show: {
            transition: { delay: transitionDelay + (transitionDuration - 0.1), duration: transitionDuration },
            y: 0
          }
        }}
        className='col-span-full flex gap-4 max-sm:flex-col sm:items-center'
      >
        <Avatar color='primary' className='bg-primary/10 bs-[52px] is-[52px]'>
          <AvatarFallback>{icon}</AvatarFallback>
        </Avatar>
        <div className='flex flex-col items-start gap-1'>
          <h3 className='text-primary text-xl font-semibold sm:text-2xl'>{title}</h3>
          {description && <p className='text-textPrimary text-lg'>{description}</p>}
        </div>
      </MotionFadeElement>
      <MotionFadeElement
        component='div'
        variants={{
          hidden: { x: imageDirection === 'left' ? -30 : 30 },
          show: {
            transition: { delay: transitionDelay + (transitionDuration - 0.1) * 2, duration: transitionDuration },
            x: 0
          }
        }}
        className={cn('self-center max-lg:flex max-lg:justify-center', {
          'order-last lg:justify-self-end': imageDirection === 'right'
        })}
      >
        {image && typeof image === 'object' && 'srcLight' in image && 'srcDark' in image ? (
          <Image
            srcLight={image.srcLight}
            srcDark={image.srcDark}
            alt={image.alt ?? 'Feature Image'}
            className={cn('rounded-xl border-2 shadow-lg', image.className)}
          />
        ) : (
          image
        )}
      </MotionFadeElement>
      <div className='flex flex-col justify-center gap-6 sm:gap-7'>
        {features.map((feature, i) => (
          <MotionFadeElement
            key={i}
            component='div'
            variants={{
              hidden: { x: imageDirection === 'left' ? 30 : -30 },
              show: {
                transition: {
                  delay: transitionDelay + (transitionDuration - 0.1) * (i + 2),
                  duration: transitionDuration
                },
                x: 0
              }
            }}
            className='flex flex-col items-start gap-3'
          >
            <div className='flex gap-1.5'>
              {feature.icon}
              <h4 className='text-lg font-semibold'>{feature.title}</h4>
            </div>
            <p className='text-textSecondary text-base'>{feature.description}</p>
          </MotionFadeElement>
        ))}
      </div>
      <BorderBeam delay={animationDelay} />
    </MotionFadeElement>
  )
}

export default FeaturesImageOutlined
