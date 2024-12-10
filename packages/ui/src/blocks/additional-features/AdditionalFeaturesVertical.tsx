// React Imports
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

const AdditionalFeaturesVertical = (props: Props) => {
  // Props
  const { data, className, transitionDelay = 0.2, transitionDuration = 0.05 } = props

  return (
    <div className={cn('grid gap-6 md:grid-cols-2 lg:grid-cols-4', className)}>
      {data.map((item, index) => (
        <BlurFade
          key={index}
          delay={transitionDelay + index * transitionDuration}
          inView
          className='border-be-[3px] hover:border-primary bg-card pli-6 pbs-6 pbe-[21px] flex flex-col items-center gap-6 rounded-xl border-transparent transition-[border-color] duration-300 ease-in-out'
        >
          <Avatar size='2xl' color='primary' className='bg-primary/10'>
            <AvatarFallback>{item.icon}</AvatarFallback>
          </Avatar>
          <div className='flex flex-col items-center gap-1.5 text-center'>
            <h5 className='text-textPrimary text-lg font-semibold'>{item.title}</h5>
            <p className='text-textSecondary text-base font-medium'>{item.description}</p>
          </div>
        </BlurFade>
      ))}
    </div>
  )
}

export default AdditionalFeaturesVertical
