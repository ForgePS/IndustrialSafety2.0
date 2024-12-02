// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import { TbCircleCheck } from 'react-icons/tb'

// Component Imports
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar'
import { MotionFadeElement } from '@repo/ui/components/ui/motion-element'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

type CardData = {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  features: string[]
  className?: string
}

type Props = {
  data: CardData[]
  className?: string
  transitionDelay?: number
  transitionDuration?: number
}

const FeaturesCardsOutlined = (props: Props) => {
  // Props
  const { data, className, transitionDelay = 0.2, transitionDuration = 0.4 } = props

  return (
    <div className={cn('grid gap-6 md:grid-cols-2 lg:grid-cols-3', className)}>
      {data.map((item, index) => (
        <MotionFadeElement
          key={index}
          component='div'
          variants={{
            hidden: { y: 30 },
            show: { transition: { delay: transitionDelay * index, duration: transitionDuration }, y: 0 }
          }}
          className={cn('border-primary flex flex-col items-start gap-5 rounded-xl border p-6', item.className)}
        >
          <Avatar size='2xl' color='primary' className='bg-primary/10'>
            <AvatarFallback>{item.icon}</AvatarFallback>
          </Avatar>
          <div className='flex flex-col items-start gap-1.5'>
            <h3 className='text-textPrimary text-xl font-semibold sm:text-2xl'>{item.title}</h3>
            {item.description && <p className='text-textSecondary text-base'>{item.description}</p>}
          </div>
          {item.features.length !== 0 && (
            <ul className='space-b-2 sm:space-b-4'>
              {item.features.map((feature, i) => (
                <li key={i} className='flex items-center gap-2'>
                  <TbCircleCheck className='text-primary text-xl sm:text-2xl' />
                  <p className='text-textSecondary text-base font-semibold sm:text-lg'>{feature}</p>
                </li>
              ))}
            </ul>
          )}
        </MotionFadeElement>
      ))}
    </div>
  )
}

export default FeaturesCardsOutlined
