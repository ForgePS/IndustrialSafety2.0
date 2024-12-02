// Third-party Imports
import { useSidebar } from '@repo/ui/components/ui/sidebar'
import { cn } from '@repo/ui/lib/utils'

// SVG Imports
import AppLogo from '@/assets/svg/Logo'

const Logo = ({ appName, logoId }: { appName: string; logoId?: string }) => {
  // Hooks
  const { isMobile, state } = useSidebar()

  return (
    <div className='flex items-center'>
      <AppLogo className='text-primary text-[2rem]' linearGradientId={logoId} />
      <span
        className={cn('text-foreground mis-2 text-nowrap text-xl font-extrabold', {
          hidden: !isMobile && state === 'collapsed'
        })}
      >
        {appName}
      </span>
    </div>
  )
}

export default Logo
