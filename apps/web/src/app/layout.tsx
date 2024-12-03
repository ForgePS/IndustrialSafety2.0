// React Imports
import type { ReactNode } from 'react'

// Next Imports
import { Inter } from 'next/font/google'
import type { Metadata } from 'next'

// Third-party Imports
import { clsx } from 'clsx'
import { TbCircleCheck, TbInfoCircle, TbAlertTriangle, TbBan } from 'react-icons/tb'
import ThemeProvider from '@repo/ui/theme/Provider'
import { SettingsProvider } from '@repo/ui/contexts/settingsContext'
import SetupSystemMode from '@repo/ui/theme/SetupSystemMode'
import { TooltipProvider } from '@repo/ui/components/ui/tooltip'
import { Toaster } from '@repo/ui/components/ui/sonner'
import { getMode, getSettingsFromCookie, getSystemMode } from '@repo/ui/utils/serverHelpers'
import 'react-perfect-scrollbar/dist/css/styles.css'

// Config Imports
import appConfig from '@/configs/appConfig'

// Style Imports
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    template: 'Demo: %s | ChatFlow AI - NextJS Boilerplate PRO',
    default: 'Demo: ChatFlow AI - NextJS Boilerplate PRO'
  },
  description:
    'Automate customer support with ChatFlow AI. Boost satisfaction, resolve queries 24/7, and deliver seamless service using an all-in-one AI chatbot solution.'
}

const RootLayout = async ({ children }: { children: ReactNode }) => {
  // Vars
  const mode = await getMode(appConfig)
  const systemMode = await getSystemMode(appConfig)
  const settingsCookie = await getSettingsFromCookie(appConfig)

  return (
    <html
      lang='en'
      className='is-full min-bs-full flex scroll-smooth'
      data-theme={systemMode}
      style={{ colorScheme: systemMode }}
    >
      <body className={clsx(inter.className, 'is-full min-bs-full flex flex-auto flex-col')}>
        <ThemeProvider attribute='data-theme' defaultTheme='light' enableSystem disableTransitionOnChange>
          <SettingsProvider settingsCookie={settingsCookie} mode={mode} appConfig={appConfig}>
            {/* The following component gracefully handles system mode using `colorPref` cookie */}
            <SetupSystemMode modeFallback={systemMode} />
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster
              position='top-right'
              icons={{
                success: <TbCircleCheck />,
                info: <TbInfoCircle />,
                warning: <TbAlertTriangle />,
                error: <TbBan />
              }}
            />
          </SettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

export default RootLayout
