// SVG Imports
import AppLogo from '@/assets/svg/Logo'

// Config Imports
import appConfig from '@configs/appConfig'

const Logo = ({ logoId }: { logoId?: string }) => {
  return (
    <div className='flex items-center'>
      <AppLogo className='text-primary text-[2rem]' linearGradientId={logoId} />
      <span className='text-textPrimary hover:text-foreground mis-2 text-nowrap text-xl font-extrabold'>
        {appConfig.appName}
      </span>
    </div>
  )
}

export default Logo
