// Third-party Imports
import { useSidebar } from '@repo/ui/components/ui/sidebar'
import { cn } from '@repo/ui/lib/utils'

// SVG Imports
import AppLogo from '@/assets/svg/Logo'

// Config Imports
import appConfig from '@configs/appConfig'

const Logo = ({ logoId }: { logoId?: string }) => {
  // Hooks
  const { isMobile, state } = useSidebar()

  return (
    <div className='flex items-center'>
      <AppLogo className='text-primary text-[2rem]' linearGradientId={logoId} />
      <span
        className={cn('text-textPrimary hover:text-foreground mis-2 text-nowrap text-xl font-extrabold', {
          hidden: !isMobile && state === 'collapsed'
        })}
      >
        {appConfig.appName}
      </span>
    </div>
  )
}

export default Logo
