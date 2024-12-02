// SVG Imports
import AppLogo from '@/assets/svg/Logo'

const Logo = ({ appName, logoId }: { appName: string; logoId?: string }) => {
  return (
    <div className='flex items-center'>
      <AppLogo className='text-primary text-[2rem]' linearGradientId={logoId} />
      <span className='text-foreground mis-2 text-nowrap text-xl font-extrabold'>{appName}</span>
    </div>
  )
}

export default Logo
