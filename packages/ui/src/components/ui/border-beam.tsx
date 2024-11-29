// Util Imports
import { cn } from '@repo/ui/lib/utils'

const BorderBeam = ({ className, delay = 0 }: { delay?: number; className?: string }) => {
  return (
    <div
      style={{ animationDelay: `${delay}s` }}
      className={cn(
        'after:is-80 after:animate-border-beam pointer-events-none absolute inset-0 rounded-[11px] border border-transparent ![mask-clip:padding-box,border-box] ![mask-composite:intersect] [mask:linear-gradient(transparent,transparent),linear-gradient(white,white)] after:absolute after:aspect-square after:[animation-delay:inherit] after:[background:linear-gradient(to_left,hsl(var(--primary)),transparent)] after:[offset-anchor:90%_50%] after:[offset-path:rect(0_auto_auto_0_round_320px)]',
        className
      )}
    />
  )
}

export default BorderBeam
