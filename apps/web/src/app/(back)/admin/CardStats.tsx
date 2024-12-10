// Third-party Imports
import { TbTrendingDown, TbTrendingUp } from 'react-icons/tb'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar'
import { cn } from '@repo/ui/lib/utils'

type Stats = {
  title: string
  stats: string
  percentage: number
  icon: JSX.Element
}

type Props = {
  data: Stats
  className?: string
}

const CardStats = ({ data, className }: Props) => {
  return (
    <Card className={className}>
      <CardContent className='bs-full pbs-6 flex flex-col justify-between'>
        <div className='flex justify-between gap-4'>
          <div className='flex flex-col gap-2'>
            <h2 className='font-medium'>{data.title}</h2>
            <h1 className='text-3xl font-semibold'>{data.stats}</h1>
          </div>
          <Avatar size='3xl' color='primary'>
            <AvatarFallback>{data.icon}</AvatarFallback>
          </Avatar>
        </div>
        <div className='mbs-2 flex items-center'>
          {data.percentage >= 0 ? (
            <TbTrendingUp className='text-success mie-1 text-xl' />
          ) : (
            <TbTrendingDown className='text-destructive mie-1 text-xl' />
          )}
          <span
            className={cn('mie-2 text-sm font-medium', {
              'text-destructive': data.percentage < 0,
              'text-success': data.percentage >= 0
            })}
          >
            {`${data.percentage}%`}
          </span>
          <span className='text-textDisabled text-xs uppercase'>vs prev. month</span>
        </div>
      </CardContent>
    </Card>
  )
}

export default CardStats
