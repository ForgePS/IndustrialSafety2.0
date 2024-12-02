// React Imports
import type { ReactNode } from 'react'

// Component Imports
import { Button } from '@repo/ui/components/ui/button'
import { MotionFadeElement } from '@repo/ui/components/ui/motion-element'
import Meteors from '@repo/ui/components/ui/meteors'
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
  logo?: ReactNode
  content: ReactNode
  button: ReactNode
  buttonClassName?: string
  image: ImageType | ReactNode
  imageDirection?: 'left' | 'right'
  className?: string
  transitionDelay?: number
  transitionDuration?: number
}

const CTABuyNow = (props: Props) => {
  // Props
  const {
    logo,
    content,
    button,
    buttonClassName,
    image,
    imageDirection = 'right',
    className,
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
      className={cn(
        'from-primary shadow-primaryLg pli-12 plb-9 relative grid gap-8 overflow-hidden rounded-xl bg-gradient-to-r to-[#5A16EB] lg:grid-cols-2 lg:gap-12',
        className
      )}
    >
      <Meteors number={20} />
      <div className='z-[2] flex flex-col items-start gap-6 lg:gap-8'>
        <div className='flex flex-col items-start gap-3'>
          {logo}
          {content}
        </div>
        <Button
          size='lg'
          variant='tonal'
          className={cn(
            'max-sm:is-full text-wrap bg-[#9880FF] text-white shadow hover:bg-[#8364ff] hover:shadow-md active:bg-[#8364ff]',
            buttonClassName
          )}
        >
          {button}
        </Button>
      </div>
      <div
        className={cn('relative z-[2] flex max-lg:justify-center lg:items-center', {
          'order-first': imageDirection === 'left'
        })}
      >
        {image && typeof image === 'object' && 'srcLight' in image && 'srcDark' in image ? (
          <Image
            srcLight={image.srcLight}
            srcDark={image.srcDark}
            alt={image.alt ?? 'CTA Image'}
            className={image.className}
          />
        ) : (
          image
        )}
      </div>
    </MotionFadeElement>
  )
}

export default CTABuyNow
