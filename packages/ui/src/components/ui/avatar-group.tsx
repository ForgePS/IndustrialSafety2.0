// Component Imports
import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/ui/avatar'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

interface AvatarGroupProps {
  limit: number
  avatarUrls: string[]
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  className?: string
}

const AvatarGroup = ({ limit, avatarUrls, size = 'xl', className }: AvatarGroupProps) => {
  const childrenArray =
    avatarUrls.length !== limit ? (avatarUrls.length > limit ? avatarUrls.slice(0, limit - 1) : avatarUrls) : avatarUrls

  return (
    <div
      className={cn(
        'rtl:space-i-reverse flex',
        {
          '-space-i-2.5': size === 'xs',
          '-space-i-3': size === 'sm' || size === 'md',
          '-space-i-4': size === 'lg' || size === 'xl',
          '-space-i-5': size === '2xl' || size === '3xl'
        },
        className
      )}
    >
      {childrenArray.map((url, index) => {
        return (
          <Avatar
            key={index}
            shape='circle'
            size={size}
            className='border-card border-2 transition-transform duration-200 hover:z-[1] hover:-translate-y-1 hover:cursor-pointer hover:shadow'
          >
            <AvatarImage src={url} />
            <AvatarFallback className='text-card text-xs'>{index + 1}</AvatarFallback>
          </Avatar>
        )
      })}
      {avatarUrls.length > limit && (
        <Avatar
          shape='circle'
          size={size}
          className='border-card text-card border-2 text-xs transition-transform duration-200 hover:z-[1] hover:-translate-y-1 hover:cursor-pointer hover:shadow'
        >
          <AvatarFallback>{`+${avatarUrls.length - limit + 1}`}</AvatarFallback>
        </Avatar>
      )}
    </div>
  )
}

export default AvatarGroup
