// React Imports
import type { SVGAttributes } from 'react'

// Third-party Imports
import { TbLoader2 } from 'react-icons/tb'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const Loader = (props: SVGAttributes<SVGElement>) => {
  const { fontSize = '2rem', className, ...rest } = props

  return (
    <div className='bs-full flex items-center justify-center'>
      <TbLoader2 className={cn('animate-spin', className)} fontSize={fontSize} {...rest} />
    </div>
  )
}

export default Loader
