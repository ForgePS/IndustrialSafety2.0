// React Imports
import type { ReactNode } from 'react'

// Component Imports
import { Button } from '@repo/ui/components/ui/button'
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
  title: string
  description: string
  button: ReactNode
  image?: ImageType | ReactNode
  className?: string
  buttonClassName?: string
  transitionDelay?: number
  transitionDuration?: number
}

const CTADiscord = (props: Props) => {
  // Props
  const {
    title,
    description,
    button,
    image,
    className,
    buttonClassName,
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
      className={cn('bg-card pli-12 plb-9 flex items-center gap-10 rounded-xl border max-lg:flex-col', className)}
    >
      {image &&
        (typeof image === 'object' && 'srcLight' in image && 'srcDark' in image ? (
          <Image
            srcLight={image.srcLight}
            srcDark={image.srcDark}
            alt={image.alt ?? 'CTA Image'}
            className={image.className}
          />
        ) : (
          image
        ))}
      <div className='flex flex-1 flex-col items-center gap-3.5 lg:items-start'>
        <h3 className='text-textPrimary text-2xl font-semibold max-lg:text-center'>{title}</h3>
        <p className='text-textSecondary text-base max-lg:text-center'>{description}</p>
      </div>
      <Button size='lg' className={buttonClassName}>
        {button}
      </Button>
    </MotionFadeElement>
  )
}

export default CTADiscord
