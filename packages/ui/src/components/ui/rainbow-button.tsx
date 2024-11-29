// Type Imports
import type { ButtonProps } from './button'

// Component Imports
import { Button } from './button'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const RainbowButton = ({ className, children, ...props }: ButtonProps) => {
  return (
    <Button
      className={cn(
        'animate-rainbow before:block-end-[-16%] before:bs-[16%] before:is-full before:animate-rainbow relative border border-transparent bg-[linear-gradient(hsl(259,84%,50%),hsl(var(--primary))),linear-gradient(hsl(var(--primary))_50%,hsl(var(--primary)/0.6)_80%,hsl(var(--primary)/0)),linear-gradient(90deg,hsl(var(--destructive)),hsl(var(--warning)),hsl(var(--success)),hsl(var(--info)),hsl(var(--primary)))] [animation-duration:2s] [background-clip:padding-box,border-box,border-box] [background-origin:border-box] before:absolute before:start-0 before:bg-[linear-gradient(90deg,hsl(var(--destructive)),hsl(var(--warning)),hsl(var(--success)),hsl(var(--info)),hsl(var(--primary)))] before:bg-[length:200%] before:[filter:blur(calc(0.8*1rem))]',
        className
      )}
      {...props}
    >
      {children}
    </Button>
  )
}

export default RainbowButton
