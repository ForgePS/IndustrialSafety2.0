// Type Imports
import type { ButtonProps } from './button'

// Component Imports
import { Button } from './button'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const ShimmerButton = ({ className, shape, children, ...props }: ButtonProps) => {
  return (
    <Button shape={shape} className={cn('group relative z-0 overflow-hidden', className)} {...props}>
      <div className='absolute inset-0 -z-30 overflow-visible blur-[2px] [container-type:size]'>
        <div className='bs-[100cqh] animate-shimmer-slide absolute inset-0 rounded-none [aspect-ratio:1] [mask:none]'>
          <div className='animate-spin-around is-auto absolute -inset-full rotate-0 [background:conic-gradient(from_225deg,transparent_0,#FFF_90deg,transparent_90deg)] [translate:0_0]' />
        </div>
      </div>
      {children}
      <div
        className={cn(
          'from-primary to-primary inset-block-px inset-inline-0.5 absolute -z-20 rounded bg-gradient-to-r via-[hsl(259,84%,50%)] bg-[200%_auto]',
          { 'rounded-full': shape === 'rounded' }
        )}
      />
    </Button>
  )
}

export default ShimmerButton
