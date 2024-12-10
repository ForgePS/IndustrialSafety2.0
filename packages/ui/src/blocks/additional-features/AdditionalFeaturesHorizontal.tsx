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

const AdditionalFeaturesHorizontal = (props: Props) => {
  // Props
  const { data, className, transitionDelay = 0.2, transitionDuration = 0.05 } = props

  return (
    <div className={cn('grid gap-6 md:grid-cols-2 lg:grid-cols-3', className)}>
      {data.map((item, index) => (
        <BlurFade
          key={index}
          delay={transitionDelay + index * transitionDuration}
          inView
          className='border-is-4 hover:border-primary bg-card pis-5 pie-6 plb-5 flex flex-col items-start gap-3 rounded-xl border-transparent transition-[border-color,box-shadow] duration-300 ease-in-out hover:shadow'
        >
          <div className='flex items-center gap-3 text-center'>
            <Avatar shape='circle' size='3xl' color='primary' className='bg-primary/10'>
              <AvatarFallback>{item.icon}</AvatarFallback>
            </Avatar>
            <h5 className='text-textPrimary text-lg font-semibold'>{item.title}</h5>
          </div>
          <p className='text-textSecondary text-base font-medium'>{item.description}</p>
        </BlurFade>
      ))}
    </div>
  )
}

export default AdditionalFeaturesHorizontal
