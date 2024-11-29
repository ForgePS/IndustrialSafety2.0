// React Imports
import type { HTMLAttributes } from 'react'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('bg-accent animate-pulse rounded-md', className)} {...props} />
}

export { Skeleton }
