// Component Imports
import { MotionElement } from '@repo/ui/components/ui/motion-element'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

type Props = {
  className?: string
  transitionDelay?: number
  transitionDuration?: number
}

const Separator = ({ className, transitionDelay = 0.2, transitionDuration = 0.4 }: Props) => {
  return (
    <MotionElement
      component='hr'
      viewport={{ once: true }}
      initial={{ opacity: 0 }}
      whileInView={{
        opacity: 1,
        transition: { delay: transitionDelay, duration: transitionDuration }
      }}
      className={cn(
        'is-3/4 sm:is-3/5 md:is-2/5 mli-auto bs-[1px] border-none bg-[linear-gradient(90deg,#9295b300,#9295b32e,#9295b300)]',
        className
      )}
    />
  )
}

export default Separator
