// React Imports
import type { ReactNode } from 'react'

// Next Imports
import { Inter } from 'next/font/google'
import type { Metadata } from 'next'
import Script from 'next/script'

// Third-party Imports
import { clsx } from 'clsx'
import { TbCircleCheck, TbInfoCircle, TbAlertTriangle, TbBan } from 'react-icons/tb'
import ThemeProvider from '@repo/ui/theme/Provider'
import { SettingsProvider } from '@repo/ui/contexts/settingsContext'
import SetupSystemMode from '@repo/ui/theme/SetupSystemMode'
import ReactQueryProvider from '@repo/ui/providers/ReactQueryProvider'
import { TooltipProvider } from '@repo/ui/components/ui/tooltip'
import { Toaster } from '@repo/ui/components/ui/sonner'
import { getMode, getSettingsFromCookie, getSystemMode } from '@repo/ui/utils/serverHelpers'
import 'react-perfect-scrollbar/dist/css/styles.css'
import { getPublicGeneralSettings } from '@repo/supabase/clientHelpers'
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'

// Config Imports
import appConfig from '@configs/appConfig'

// Style Imports
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export async function generateMetadata(): Promise<Metadata> {
  const { data: settingsData, error } = await getPublicGeneralSettings()

  if (error) {
    console.error(error)
  }

  let appName
  let title
  let description

  if (settingsData) {
    const settings = JSON.parse(settingsData.value) as SettingsConfiguration['general_settings']

    appName = settings.application?.site_name
    title = settings.application?.title
    description = settings.application?.description
  }

  return {
    title: title
      ? title.includes('%s')
        ? { template: title, default: title.replace('%s | ', '').replace('%s ', '') }
        : title
      : appName
        ? {
            template: `Demo: %s | ${appName} - NextJS Boilerplate PRO`,
            default: `Demo: ${appName} - NextJS Boilerplate PRO`
          }
        : {
            template: 'Demo: %s | ChatFlow AI - NextJS Boilerplate PRO',
            default: 'Demo: ChatFlow AI - NextJS Boilerplate PRO'
          },
    description: description
      ? description
      : 'Automate customer support with ChatFlow AI. Boost satisfaction, resolve queries 24/7, and deliver seamless service using an all-in-one AI chatbot solution.'
  }
}

const RootLayout = async ({ children }: { children: ReactNode }) => {
  // Vars
  const mode = await getMode(appConfig)
  const systemMode = await getSystemMode(appConfig)
  const settingsCookie = await getSettingsFromCookie(appConfig)
  const { data: settingsData, error } = await getPublicGeneralSettings()

  if (error) {
    console.error(error)
  }

  let gtm
  let providerScripts: string[] = []

  if (settingsData) {
    const settings = JSON.parse(settingsData.value) as SettingsConfiguration['general_settings']

    gtm = settings.tracking?.google_tag_manager || ''

    providerScripts = settings.tracking?.providers?.map(provider => provider.snippet) || []
  }

  return (
    <html
      lang='en'
      className='is-full min-bs-full flex scroll-smooth'
      data-theme={systemMode}
      style={{ colorScheme: systemMode }}
    >
      <head>
        {/*Google tag manager*/}
        {gtm !== '' && (
          <Script
            id='gtm-script'
            strategy='afterInteractive'
            dangerouslySetInnerHTML={{
              __html: `
                  (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
                  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
                  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
                  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
                  })(window,document,'script','dataLayer','${gtm}');
                `
            }}
          />
        )}
      </head>
      <body className={clsx(inter.className, 'is-full min-bs-full flex flex-auto flex-col')}>
        {gtm !== '' && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtm}`}
              height='0'
              width='0'
              style={{ display: 'none', visibility: 'hidden' }}
            ></iframe>
          </noscript>
        )}
        <ThemeProvider attribute='data-theme' defaultTheme='light' enableSystem disableTransitionOnChange>
          <SettingsProvider settingsCookie={settingsCookie} mode={mode} appConfig={appConfig}>
            {/* The following component gracefully handles system mode using `colorPref` cookie */}
            <SetupSystemMode modeFallback={systemMode} />
            <ReactQueryProvider>
              <TooltipProvider>{children}</TooltipProvider>
            </ReactQueryProvider>
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
        {providerScripts.map((script, index) => {
          // Check if the script is an external script (has src attribute)
          const srcMatch = script.match(/src="([^"]+)"/)

          if (srcMatch) {
            // External script

            return (
              <Script
                key={`provider-script-${index}`}
                src={srcMatch[1]} // Extract the src URL from the snippet
                strategy='afterInteractive'
              />
            )
          } else {
            // Inline script (strip out the <script> tags)
            const inlineScript = script.replace(/<\/?script[^>]*>/g, '')

            return (
              <Script
                key={`provider-inline-script-${index}`}
                id={`provider-inline-script-${index}`}
                strategy='afterInteractive'
                dangerouslySetInnerHTML={{
                  __html: inlineScript
                }}
              />
            )
          }
        })}
      </body>
    </html>
  )
}

export default RootLayout
